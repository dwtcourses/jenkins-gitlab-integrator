from aiohttp.client_exceptions import ClientResponseError, ClientConnectorError

from server.core.common import LoggingMixin
from server.core.clients.gitlab_client import GitLabPush
from server.core.models.jenkins_groups import JenkinsGroupManager
from server.core.models.jenkins_jobs import JenkinsJobManager
from server.core.models.delayed_tasks import DelayedTaskManager, DelayedTask, RecordNotFound
from server.core.clients.jenkins_client import JenkinsClient


class GitLabPushService(LoggingMixin):
    """
    Processing push message from gitlab

    """

    def __init__(self, marker, db, db_tables, jenkins_config, gitlab_config, workers_config, loop=None):
        """
        Args:
            marker - uuid marker for flow
            db - db pool sqlalchemy
            db_tables - tables sqlalchemy
            jenkins_config - config jenkins
            gitlab_config - gitlab_config
            loop - asyncio loop, if None we get from MainThread
        """
        self._db = db
        self._db_tables = db_tables
        self._loop = loop
        self._marker = marker
        self._jenkins_config = jenkins_config
        self._gitlab_config = gitlab_config
        self._workers_config = workers_config
        self._jenkins_client = JenkinsClient(self._marker,
                                             jenkins_config['user_id'],
                                             jenkins_config['api_token'],
                                             loop=self._loop)

        self._delayed_task_manager = DelayedTaskManager(self._marker, db, db_tables)
        self._jenkins_group_manager = JenkinsGroupManager(self._marker, db, db_tables)
        self._jenkins_job_manager = JenkinsJobManager(self._marker, db, db_tables)

    async def exec_raw(self, group, job_name, gitlab_push_raw_data):
        """
        (raw data) Exec Jenkins job or create delayed task

        Args:
            group - Jenkins apps group in jenkins_config
            job_name - Name of job in jenkins apps group
            gitlab_push_raw_data - raw push data from gitlab
        """
        gitlab_push_obj = GitLabPush.from_push_data(gitlab_push_raw_data)
        self._logging_info(gitlab_push_obj)

        # don`t start with empty sha or branch
        if gitlab_push_obj.sha1 is None or gitlab_push_obj.branch is None:
            self._logging_info("Skip push %s " % (gitlab_push_obj))
        else:
            delayed_task = DelayedTask.make_push_task(group, job_name, gitlab_push_obj.sha1, gitlab_push_obj.branch)
            await self.exec(delayed_task)

    async def exec(self, delayed_task):
        """
        (prepared data) Exec Jenkins job or create delayed task

        Args:
            delayed_task - DelayedTask obj
        """
        self._logging_debug(delayed_task)

        self._logging_info("check jobs")
        jobs_exists = await self._check_jobs(delayed_task.group, delayed_task.branch)
        if jobs_exists:
            self._logging_info("start build")
            await self._start_first_job(delayed_task)
        else:
            self._logging_info("create delayed task")
            await self._delayed_task(delayed_task)

    async def _check_jobs(self, group_name, branch):
        """
        Checking the existence of necessary job in Jenkins

        Args:
            group_name - jenkins_group name
            branch - Branch from gitlab push data

        Return:
            True - all job exist
            False - if at least one job is missing
        """
        try:
            jenkins_group = await self._jenkins_group_manager.find_by_name(group_name)
            jenkins_jobs = await self._jenkins_job_manager.find_by_group_id(jenkins_group.id)
            for job in jenkins_jobs:
                await self._jenkins_client.job_exists(jenkins_group.jobs_base_path, job.name, branch)

        except (ClientResponseError) as e:
            self._logging_debug(e)
            return False
        except (ClientConnectorError) as e:
            self._logging_error(e)
            return False
        return True

    async def _start_first_job(self, delayed_task):
        """
        Immediately start fist job in Jenkins

        Args:
            delayed_task - DelayedTask obj
        """
        jenkins_group = await self._jenkins_group_manager.find_by_name(delayed_task.group)
        first_job = await self._jenkins_job_manager.find_first_by_group_id(jenkins_group.id)

        await self._jenkins_client.build(jenkins_group.jobs_base_path, first_job.name, delayed_task.branch)

        try:
            n_delayed_task = await self._delayed_task_manager.get_by_uniq_md5sum(delayed_task.uniq_md5sum)
            await self._delayed_task_manager.set_status_success(n_delayed_task.id)
            await self._delayed_task_manager.increment_attempts(n_delayed_task.id)
        except RecordNotFound as e:
            pass
        except Exception as e:
            self._logging_error(e)

    async def _delayed_task(self, delayed_task):
        try:
            n_delayed_task = await self._delayed_task_manager.get_or_create(delayed_task)
            self._logging_info("delayed task was created %s" % (n_delayed_task))
            await self._delayed_task_manager.increment_attempts(n_delayed_task.id)

            if n_delayed_task.counter_attempts > self._workers_config['max_attempts']:
                await self._delayed_task_manager.set_status_canceled(n_delayed_task.id)
        except RecordNotFound as e:
            pass
        except Exception as e:
            raise


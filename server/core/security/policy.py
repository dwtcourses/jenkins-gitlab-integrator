import enum
import aiohttp_security
from functools import wraps
from aiohttp import web
from aiohttp_security.abc import AbstractAuthorizationPolicy


class Permission(enum.Enum):
    """
        App permissions
    """
    ONLY_AUTH = 0  # only auth user
    ADMIN_UI = 1  # can user admin ui


class FileAuthorizationPolicy(AbstractAuthorizationPolicy):
    """
    Implement Authorization Policy
    """

    def __init__(self, users):
        self.users = users

    async def authorized_userid(self, identity):
        """
            Check already auth user

            Return:
                username - valid user
                or
                None - invalid user
        """
        for user in self.users:
            if user['username'] == identity:
                return identity
        return None

    async def permits(self, identity, permission, context=None):
        """
            Check user permission

            Args:
                identity - username
                permission - Permission enum
                context - not using
            Return:
                True - user can access
                or
                False - forbidden
        """
        try:
            Permission[permission]
        except KeyError:
            return False

        for user in self.users:
            if user['username'] == identity:
                if Permission[permission] == Permission.ONLY_AUTH:
                    return True

                for cur_user_permission in user['permission']:
                    try:
                        print(cur_user_permission)
                        if Permission[cur_user_permission] == Permission[permission]:
                            return True
                    except KeyError:
                        pass
        return False


async def check_credentials(users, username=None, password=None):
    """
        Check user credentials

        Args:
            users - users list
            username - username
            passwordd - password

        Return:
            True - correct credentials
            or
            False - incorrect credentials or user not exist
    """
    for user in users:
        if user['username'] == username and user['password'] == password:
            return True, user['username']
    return False, None


async def check_permission(request, permission):
    has_perm = await aiohttp_security.permits(request, permission.name)
    return has_perm


async def is_authenticated(request):
    """
        auth check

        Args:
            request - aiohttp request

        Return:
            True - if user already auth
            or
            False - if not auth
    """
    return await check_permission(request, Permission.ONLY_AUTH)


async def logout(request):
    """
        Logout user

        Args:
            request - aiohttp request

        Return:
            True or exceptions
    """
    index_url = request.app.router['index'].url()
    response = web.HTTPFound(index_url)
    if await is_authenticated(request):
        await aiohttp_security.forget(request, response)
    return True


def auth_by_gitlab_token(func):
    """
        Decorator auth by X-Gitlab-Token in view
    """

    @wraps(func)
    async def wrapper(*args):
        request = args[0].request
        valid_token = False
        try:
            if request.app['config']['gitlab_webhook_token'] == request.headers['X-Gitlab-Token']:
                valid_token = True
        except KeyError:
            valid_token = False
        finally:
            if not valid_token:
                message = 'Incorrect X-Gitlab-Token'
                raise web.HTTPUnauthorized(reason=message)
        return await func(*args)

    return wrapper


def require_permission(permission):
    """
        Decorator for check user permission in view

        Args:
            Permission - object
    """

    def wrapper(func):
        @wraps(func)
        async def wrapped(*args):
            request = args[0].request
            has_perm = await check_permission(request, permission)
            if not has_perm:
                message = 'You has no permission'
                raise web.HTTPForbidden(reason=message)
            return await func(*args)

        return wrapped

    return wrapper

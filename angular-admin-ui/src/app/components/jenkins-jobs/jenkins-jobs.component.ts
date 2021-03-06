import { Component, Input, OnInit, SimpleChange,  SimpleChanges } from '@angular/core';
import { ToastyService } from "ng2-toasty";
import { JenkinsJob } from "../../models/jenkins-job";
import { JenkinsJobService } from "../../services/jenkins-job.service";
import { JenkinsGroup } from "../../models/jenkins-group";
import { JenkinsGroupService } from '../../services/jenkins-group.service'
import { Stat } from '../../models/stat'
import { StatsService } from '../../services/stats.service'



@Component({
  selector: 'app-jenkins-jobs',
  templateUrl: './jenkins-jobs.component.html',
})
export class JenkinsJobsComponent implements OnInit {
  @Input() jenkinsGroup: JenkinsGroup;
  @Input() refreshGrpahTrigger: number;

  jenkinsJobList: JenkinsJob[];
  selectJenkinsJob: JenkinsJob;
  stat: Stat;
  tabSelected: string = "jobs";


  constructor(
    private jenkinsJobServices: JenkinsJobService,
    private jenkinsGroupService: JenkinsGroupService,
    private statsService: StatsService,
    private toastyService:ToastyService,
  ) {
    this.selectJenkinsJob = new JenkinsJob();
    this.refreshGrpahTrigger = 0;
  }

  ngOnInit(): void {
    this.jenkinsJobServices.getJenkinsJobs(this.jenkinsGroup.id)
      .then(jobs => this.jenkinsJobList = jobs)
      .catch(err => this.errorMessage(err));

    this.statsService
      .getStats()
      .then(stat => this.stat = stat)
      .catch(err => this.errorMessage(err));
  }

  editJob(job: JenkinsJob): void {
    this.selectJenkinsJob = job;
  }

  saveJob(): void {
    if (!this.selectJenkinsJob.id) {
      this.selectJenkinsJob.jenkins_group_id = this.jenkinsGroup.id;
      this.jenkinsJobServices.createJenkinsJob(this.selectJenkinsJob)
        .then(job => {
          this.jenkinsJobList.push(job);
          this.selectJenkinsJob = new JenkinsJob();
          this.refreshGraph();
          this.toastyService.success("Job " + job.name + " is created");
        })
        .catch(err => { this.errorMessage(err) });
    } else {
      this.jenkinsJobServices.updateJenkinsJob(this.selectJenkinsJob)
        .then(job => {
          this.selectJenkinsJob = job;
          this.selectJenkinsJob = new JenkinsJob();
          this.refreshGraph();
          this.toastyService.success("Job " + job.name + " is updated");
        })
        .catch(err => this.errorMessage(err));
    }
  }

  deleteJob(job: JenkinsJob): void {
    if(confirm("Are you sure to delete job "+job.name)) {
      this.jenkinsJobServices.deleteJenkinsJob(job)
        .then(() => {
          this.jenkinsJobList = this.jenkinsJobList.filter(j => j !== job);
          this.refreshGraph();
          this.toastyService.success("Job " + job.name + " is deleted");
        })
        .catch(err => this.errorMessage(err));
    }
  }

  updateAllWebHooks(): void {
    this.jenkinsGroupService.updateJenkinsGroupWebhooks(this.jenkinsGroup.id)
      .then(() => {
        this.toastyService.success("all webhooks updated");
      })
      .catch(err => this.errorMessage(err));
  }

  updateWebHook(job: JenkinsJob): void {
    this.jenkinsJobServices.updateJenkinsJobWebHook(job)
      .then(() => {
        this.toastyService.success("webhook (job: " + job.name + ") is updated");
      })
      .catch(err => this.errorMessage(err))
  }

  deleteWebHook(job: JenkinsJob): void {
    if(confirm("Are you sure to delete webhook for job: "+job.name)) {
      this.jenkinsJobServices.deleteJenkinsJobWebHook(job)
        .then(() => {
          this.toastyService.success("webhook (job: " + job.name + ") is deleted");
        })
        .catch(err => this.errorMessage(err))
    }
  }

  selectTab(tabName: string): void {
    this.tabSelected = tabName;
  }

  private refreshGraph() {
    this.refreshGrpahTrigger += 1;
  }

  private errorMessage(error){
    this.toastyService.error("message: " + error.json().error + ", http_status: " + error.status)
  }
}

import { Component, ElementRef, Input, OnDestroy, OnChanges, SimpleChange, ViewEncapsulation } from '@angular/core';
import { BaseType, event, select, Selection } from 'd3-selection';
import { cluster, hierarchy, HierarchyCircularNode } from 'd3-hierarchy';
import { zoom } from 'd3-zoom';
import { JenkinsJob } from "../../../models/jenkins-job";

@Component({
  selector: 'app-jenkins-jobs-graph-widget',
  template: '<div id="graph-widget-id" class="graph-widget"></div>',
  styleUrls: ['./jenkins-jobs-graph-widget.components.css'],
  encapsulation: ViewEncapsulation.None
})
export class JenkinsJobsGraphWidgetComponent implements OnDestroy, OnChanges {
  private parentNativeElement: any;
  private width = 800;
  private height = 400;
  private svg;
  private treeData: any;
  @Input() jenkinsJobList: JenkinsJob[];
  @Input() refreshGrpahTrigger: number;

  constructor(element: ElementRef) {
    this.parentNativeElement = element.nativeElement;
  }

  ngOnChanges(changes: {[propKey: string]: SimpleChange}) {
    this.width = document.getElementById("graph-widget-id").offsetWidth;
    if (this.svg) {
      this.svg.remove();
    }
    this.treeData = this.convertJobListToTreeData(this.jenkinsJobList);
    this.svg = this.setSvg();
    const root = this.createHierarchy();

    const zoomElem = this.createZoomElem(this.svg);
    this.drawDiagram(zoomElem, this.createTreeView(root));
    this.enableZoom(this.svg, zoomElem);
  }

  ngOnDestroy(): void {
    this.svg.remove();
  }

  private convertJobListToTreeData(jobs: JenkinsJob[]): any {
    let treeData = {};
    let firstJob = jobs.find(el => el.jenkins_job_perent_id == null);
    if (firstJob) {
      treeData = this.findChildren(firstJob, jobs.slice());
    }
    return treeData;
  }

  private findChildren(job: JenkinsJob, jobs:JenkinsJob[]): any {
    let node = {'name': job.name, 'children': []};
    jobs.forEach((item, index) => {
      if (item.jenkins_job_perent_id == job.id) {
        jobs.slice(index, 1);
        node.children.push(this.findChildren(item, jobs))
      }
    });
    return node;
  }

  private createZoomElem(svg: Selection<BaseType, any, HTMLElement, any>) {
    return svg.append('g')
      .attr('transform', 'translate(100,0)scale(0.8,0.8)');
  }

  private createTreeView(root: any) {
    return cluster().size([this.height, this.width])(root);
  }

  private setSvg() {
    const rootElem = select(this.parentNativeElement);
    const svg = rootElem.select('.graph-widget').append('svg');
    this.setSize(svg);
    return svg;
  }

  private enableZoom(svg: Selection<BaseType, any, HTMLElement, any>, zoomElem: Selection<BaseType, any, HTMLElement, any>) {
    svg.append('rect')
      .attr('width', this.width)
      .attr('height', this.height)
      .style('fill', 'none')
      .style('pointer-events', 'all')
      .call(zoom()
        .scaleExtent([1 / 2, 4])
        .on('zoom', () => {
          zoomElem.attr('transform', event.transform);
        }));
  }

  private createHierarchy() {
    return <any>hierarchy(this.treeData, function (d: any) {
      return d.children;
    });
  }

  private setSize(svg: Selection<BaseType, any, HTMLElement, any>) {
    svg.attr('width', this.width);
    svg.attr('height', this.height);
  }

  private drawDiagram(selection: Selection<BaseType, any, HTMLElement, any>, root: any) {
    this.addPaths(selection, root);

    const nodesList = this.createNodeList(selection, root);

    this.addClasses(nodesList);
    this.addCircle(nodesList);
    this.addText(nodesList);
  }

  private createNodeList(selection: Selection<BaseType, any, HTMLElement, any>, root: any) {
    return selection.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g');
  }

  private addClasses(selection: Selection<BaseType, any, BaseType, any>) {
    selection
      .attr('class', function (d: SVGSVGElement) {
        return 'node' + (d.children ? ' node--internal' : ' node--leaf');
      })
      .attr('transform', function (d: SVGSVGElement) {
        return 'translate(' + d.y + ',' + d.x + ')';
      });
  }

  private addText(selection: Selection<BaseType, any, BaseType, any>) {
    selection.append('text')

      .attr('dy', 3)
      .attr('x', function (d: SVGSVGElement) {
        return d.children ? -8 : 8;
      })
      .attr('transform', () => 'rotate(-40)')

      .style('text-anchor', (d: SVGSVGElement) => d.children ? 'end' : 'start')

      .text(function (d: any) {
        return d.data.name;
      });
  }

  private addCircle(selection: Selection<BaseType, any, BaseType, any>) {
    selection.append('circle')
      .attr('r', 2.5);
  }

  private addPaths(selection: Selection<BaseType, any, HTMLElement, any>, root: any) {
    selection.selectAll('.link')
      .data(root.descendants().slice(1))
      .enter().append('path')

      .attr('class', 'link')
      .attr('d', function (d: HierarchyCircularNode<SVGLineElement>) {
        return 'M' + d.y + ',' + d.x
          + 'C' + (d.parent.y + 100) + ',' + d.x
          + ' ' + (d.parent.y + 100) + ',' + d.parent.x
          + ' ' + d.parent.y + ',' + d.parent.x;
      });
  }
}

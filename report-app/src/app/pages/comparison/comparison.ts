import {
  Component,
  HostListener,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import {toSignal} from '@angular/core/rxjs-interop';
import {map} from 'rxjs';
import {ComparisonScoreDistribution} from '../../shared/comparison/comparison-score-distribution';
import {ComparisonBuildDistribution} from '../../shared/comparison/comparison-build-distribution';
import {ModelComparisonData} from '../../shared/comparison/comparison-data';
import {ReportsFetcher} from '../../services/reports-fetcher';
import {ReportSelect} from '../../shared/report-select/report-select';
import {ComparisonRuntimeDistribution} from '../../shared/comparison/comparison-runtime-distribution';
import {ActivatedRoute} from '@angular/router';
import {MessageSpinner} from '../../shared/message-spinner';
import {
  AssessmentResultFromReportServer,
  RunInfoFromReportServer,
} from '../../../../../runner/shared-interfaces';

interface ComparisonReportSelection {
  reportName: string;
  groupId: string;
}

interface LoadedComparisonReport extends ComparisonReportSelection {
  report: RunInfoFromReportServer;
}

interface KeyedAssessmentResult {
  key: string;
  promptName: string;
  occurrence: number;
  result: AssessmentResultFromReportServer;
}

interface ScreenshotComparisonCell {
  reportName: string;
  groupId: string;
  resultId: string | null;
  screenshotUrl: string | null;
  scoreLabel: string;
}

interface ScreenshotComparisonRow {
  key: string;
  promptName: string;
  displayName: string;
  cells: ScreenshotComparisonCell[];
  availableScreenshots: number;
}

function hasSelectedReport(report: {
  reportName: string;
  groupId: string | null;
}): report is ComparisonReportSelection {
  return report.groupId !== null;
}

@Component({
  templateUrl: './comparison.html',
  styleUrl: './comparison.scss',
  imports: [
    ComparisonScoreDistribution,
    ComparisonBuildDistribution,
    ComparisonRuntimeDistribution,
    ReportSelect,
    MessageSpinner,
  ],
})
export class ComparisonPage {
  private reportsFetcher = inject(ReportsFetcher);
  private route = inject(ActivatedRoute);

  readonly groups = this.reportsFetcher.reportGroups;
  readonly groupsToCompare = linkedSignal({
    source: () => ({
      groups: this.groups(),
      selectedIds: this.selectedGroups(),
    }),
    computation: () => {
      const allGroups = this.groups();
      const results: {reportName: string; groupId: string | null}[] = [];

      this.selectedGroups().forEach(id => {
        const correspondingGroup = allGroups.find(group => group.id === id);

        if (correspondingGroup) {
          results.push({
            groupId: correspondingGroup.id,
            reportName: correspondingGroup.displayName,
          });
        }
      });

      return results;
    },
  });

  readonly selectedGroups = toSignal<string[]>(
    this.route.queryParams.pipe(
      map(params => {
        const ids = params['groups'];
        if (Array.isArray(ids)) {
          return ids;
        }

        return typeof ids === 'string' ? [ids] : [];
      }),
    ),
    {requireSync: true},
  );

  readonly screenshotReportSelections = computed(() =>
    this.groupsToCompare().filter(hasSelectedReport),
  );
  readonly screenshotColumnCount = computed(() => this.screenshotReportSelections().length);
  readonly activeScreenshotRow = signal<ScreenshotComparisonRow | null>(null);

  private readonly screenshotComparisonRowsResource = resource({
    params: () => this.screenshotReportSelections(),
    loader: async ({params}) => {
      if (params.length < 2) {
        return [];
      }

      const reports = await Promise.all(
        params.map(async selection => ({
          ...selection,
          report: await this.reportsFetcher.getCombinedReport(selection.groupId),
        })),
      );

      return this.buildScreenshotRows(reports);
    },
  });

  readonly screenshotRows = computed(() =>
    this.screenshotComparisonRowsResource.hasValue()
      ? this.screenshotComparisonRowsResource.value()
      : [],
  );
  readonly isLoadingScreenshots = computed(() => this.screenshotComparisonRowsResource.isLoading());
  readonly screenshotError = computed(() => {
    const error = this.screenshotComparisonRowsResource.error();

    if (!error) {
      return null;
    }

    return error instanceof Error ? error.message : String(error);
  });

  readonly comparisonModelData = computed(() => {
    const allGroups = this.groups();
    const selectedGroups = this.groupsToCompare()
      .map(g => ({
        reportName: g.reportName,
        group: allGroups.find(current => current.id === g.groupId)!,
      }))
      .filter(g => !!g.group);

    if (selectedGroups.length < 2) {
      return null;
    }

    return {
      averageAppsCount: Math.floor(
        selectedGroups.reduce((acc, r) => r.group.appsCount + acc, 0) / selectedGroups.length,
      ),
      series: [
        ...selectedGroups.map(r => ({
          name: r.reportName,
          stats: r.group.stats,
          appsCount: r.group.appsCount,
        })),
      ],
    } satisfies ModelComparisonData;
  });

  @HostListener('document:keydown.escape')
  protected closeOverlayOnEscape() {
    this.closeScreenshotOverlay();
  }

  protected openScreenshotOverlay(row: ScreenshotComparisonRow) {
    this.activeScreenshotRow.set(row);
  }

  protected closeScreenshotOverlay() {
    this.activeScreenshotRow.set(null);
  }

  protected updateReportName(report: {reportName: string}, newName: string) {
    report.reportName = newName;
    this.groupsToCompare.set([...this.groupsToCompare()]);
  }

  protected setSelectedGroup(index: number, groupId: string | undefined) {
    const allGroups = this.groups();
    const current = this.groupsToCompare();
    const correspondingGroup = allGroups.find(group => group.id === groupId);

    if (correspondingGroup) {
      current[index] = {
        groupId: correspondingGroup.id,
        reportName: correspondingGroup.displayName,
      };
      this.groupsToCompare.set([...current]);
    }
  }

  protected addCompareBox() {
    const currentReports = this.groupsToCompare();
    currentReports.push({
      groupId: null,
      reportName: `Report ${currentReports.length + 1}`,
    });
    this.groupsToCompare.set([...currentReports]);
  }

  protected removeCompareBox(index: number) {
    const currentReports = this.groupsToCompare();
    currentReports.splice(index, 1);
    this.groupsToCompare.set([...currentReports]);
  }

  private buildScreenshotRows(reports: LoadedComparisonReport[]): ScreenshotComparisonRow[] {
    const keyedResultsByReport = new Map<string, Map<string, KeyedAssessmentResult>>();
    const rowMetadata = new Map<string, Pick<KeyedAssessmentResult, 'promptName' | 'occurrence'>>();

    for (const report of reports) {
      const keyedResults = this.getKeyedResults(report.report);
      keyedResultsByReport.set(
        report.groupId,
        new Map(keyedResults.map(result => [result.key, result])),
      );

      for (const result of keyedResults) {
        if (!rowMetadata.has(result.key)) {
          rowMetadata.set(result.key, {
            promptName: result.promptName,
            occurrence: result.occurrence,
          });
        }
      }
    }

    return Array.from(rowMetadata.entries())
      .sort(([, a], [, b]) => {
        const promptNameOrder = a.promptName.localeCompare(b.promptName);
        return promptNameOrder === 0 ? a.occurrence - b.occurrence : promptNameOrder;
      })
      .map(([key, metadata]) => {
        const cells = reports.map(report => {
          const keyedResult = keyedResultsByReport.get(report.groupId)?.get(key);
          const result = keyedResult?.result;

          return {
            reportName: report.reportName,
            groupId: report.groupId,
            resultId: result?.id ?? null,
            screenshotUrl: result?.finalAttempt.serveTestingResult?.screenshotPngUrl ?? null,
            scoreLabel: result ? this.formatScore(result) : 'No result',
          } satisfies ScreenshotComparisonCell;
        });

        return {
          key,
          promptName: metadata.promptName,
          displayName:
            metadata.occurrence === 0
              ? metadata.promptName
              : `${metadata.promptName} (${metadata.occurrence + 1})`,
          cells,
          availableScreenshots: cells.filter(cell => !!cell.screenshotUrl).length,
        } satisfies ScreenshotComparisonRow;
      })
      .filter(row => row.availableScreenshots > 0);
  }

  private getKeyedResults(report: RunInfoFromReportServer): KeyedAssessmentResult[] {
    const occurrences = new Map<string, number>();

    return report.results.map(result => {
      const promptName = result.promptDef.name;
      const occurrence = occurrences.get(promptName) ?? 0;
      occurrences.set(promptName, occurrence + 1);

      return {
        key: `${promptName}::${occurrence}`,
        promptName,
        occurrence,
        result,
      };
    });
  }

  private formatScore(result: AssessmentResultFromReportServer): string {
    const {totalPoints, maxOverallPoints} = result.score;

    if (maxOverallPoints <= 0) {
      return 'No score';
    }

    return `${Math.round((totalPoints / maxOverallPoints) * 100)}%`;
  }
}

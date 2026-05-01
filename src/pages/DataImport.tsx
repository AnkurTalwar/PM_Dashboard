import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { FileSpreadsheet, CheckCircle, AlertTriangle, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import {
  clearWipStore,
  subscribeWipStore,
  getWipStoreSnapshot,
} from '@/lib/wip-store';
import {
  clearForecastCalendarStore,
} from '@/lib/forecast-calendar';
import {
  clearPtoCalendarStore,
} from '@/lib/pto-calendar';
import {
  PROGRAM_PACKAGE_FILE_SPECS,
  clearProgramPackageStore,
  downloadProgramPackageTemplateBundle,
  getProgramPackageStoreSnapshot,
  loadProgramPackageFromDirectory,
  subscribeProgramPackageStore,
  supportsProgramFolderPicker,
} from '@/lib/program-package';
import { toast } from 'sonner';

export default function DataImport() {
  const [processingPackage, setProcessingPackage] = useState(false);

  // Subscribe to WIP store for reactivity
  const wipState = useSyncExternalStore(subscribeWipStore, getWipStoreSnapshot);
  const packageState = useSyncExternalStore(
    subscribeProgramPackageStore,
    getProgramPackageStoreSnapshot,
  );
  const current = wipState.current;
  const history = wipState.history;
  const activePackage = packageState.current;

  const handleLoadProgramFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) {
      toast.error('Folder selection is not supported in this browser. Use Edge or Chrome.');
      return;
    }

    setProcessingPackage(true);
    try {
      const dir = await window.showDirectoryPicker({ mode: 'read' });
      const loaded = await loadProgramPackageFromDirectory(dir);
      toast.success(
        `Loaded ${loaded.manifest.programName}: ${loaded.resources.length} resources, ${loaded.projects.length} projects, ${loaded.engagementCodes.length} codes`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      toast.error(`Failed to load program folder: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setProcessingPackage(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Data Import</h1>
        <p className="text-muted-foreground mt-1">
          Load a program folder to refresh ETC, LTA, expense, forecast, PTO, and WIP data
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Load Program Package Folder</CardTitle>
          <CardDescription>
            Load the full dashboard data package from a local folder instead of using the embedded seed dataset.
            This folder flow replaces the old one-off WIP, forecast, and PTO uploads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleLoadProgramFolder} disabled={processingPackage || !supportsProgramFolderPicker()}>
              {processingPackage ? 'Loading folder…' : 'Select program folder'}
            </Button>
            {activePackage && (
              <Button
                variant="ghost"
                onClick={() => {
                  clearProgramPackageStore();
                  clearForecastCalendarStore();
                  clearPtoCalendarStore();
                  clearWipStore();
                  toast.info('Program package cleared — using embedded seed data');
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Clear package
              </Button>
            )}
            {!supportsProgramFolderPicker() && (
              <Badge variant="secondary">Use Edge or Chrome for folder access</Badge>
            )}
          </div>

          {activePackage && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">Active package: {activePackage.manifest.programName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Program ID: {activePackage.manifest.programId} • schema {activePackage.manifest.schemaVersion} • loaded {new Date(activePackage.loadedAt).toLocaleString()}
              </p>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded border p-2">
                  <div className="text-muted-foreground uppercase">Resources</div>
                  <div className="font-semibold mt-1">{activePackage.resources.length}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground uppercase">Projects</div>
                  <div className="font-semibold mt-1">{activePackage.projects.length}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground uppercase">Codes</div>
                  <div className="font-semibold mt-1">{activePackage.engagementCodes.length}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground uppercase">Forecast Weeks</div>
                  <div className="font-semibold mt-1">{activePackage.weekEndings.length}</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-muted-foreground uppercase">PTO Rows</div>
                  <div className="font-semibold mt-1">{activePackage.ptoRows}</div>
                </div>
              </div>
              {activePackage.snapshotFiles.length > 0 && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Loaded WIP snapshots: {activePackage.snapshotFiles.join(', ')}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await downloadProgramPackageTemplateBundle();
                  toast.success('Downloaded program package template bundle');
                } catch (err) {
                  toast.error(`Failed to build template bundle: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
              }}
            >
              Download template bundle
            </Button>
          </div>

          <div className="rounded-md border p-4 bg-muted/20">
            <div className="text-sm font-semibold mb-2">Folder contract</div>
            <div className="text-xs text-muted-foreground mb-3">
              JSON is used for versioned config and explicit per-project values. Excel stays for human-maintained tabular data.
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4">Template</th>
                    <th className="py-2 pr-4">Format</th>
                    <th className="py-2 pr-4">Required</th>
                    <th className="py-2">Purpose</th>
                  </tr>
                </thead>
                <tbody>
                  {PROGRAM_PACKAGE_FILE_SPECS.map((spec) => (
                    <tr key={spec.key} className="border-b border-border/50 align-top">
                      <td className="py-2 pr-4 font-mono text-xs">{spec.templateName}</td>
                      <td className="py-2 pr-4">{spec.format.toUpperCase()}</td>
                      <td className="py-2 pr-4">{spec.required ? 'Required' : 'Optional'}</td>
                      <td className="py-2">
                        <div>{spec.description}</div>
                        {spec.requiredHeaders && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Required headers: {spec.requiredHeaders.join(', ')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unmapped codes warning */}
      {current && current.unmappedCodes.length > 0 && (
        <Card className="border-warning/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-warning">
              <AlertTriangle className="h-4 w-4" />
              Unmapped Engagement Codes ({current.unmappedCodes.length})
            </CardTitle>
            <CardDescription>
              These codes appeared in the WIP file but could not be mapped to a project umbrella.
              Their data is excluded from rollups.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {current.unmappedCodes.map((code) => (
                <Badge key={code} variant="outline" className="font-mono text-xs">
                  {code}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rollup summary for current WIP */}
      {current && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Project Rollup — {current.label}
            </CardTitle>
            <CardDescription>
              WIP actuals rolled up from engagement codes to project umbrellas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 pr-4 font-medium">Project</th>
                    <th className="py-2 pr-4 font-medium text-right">Eng Revenue</th>
                    <th className="py-2 pr-4 font-medium text-right">Expenses</th>
                    <th className="py-2 pr-4 font-medium text-right">Cash Collected</th>
                    <th className="py-2 pr-4 font-medium text-right">Unbilled WIP</th>
                    <th className="py-2 pr-4 font-medium text-right">Open AR</th>
                    <th className="py-2 font-medium text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {current.rollups.map((r) => (
                    <tr key={r.project} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-medium">{r.project}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.engRevenue.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.expenses.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.cashCollected.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.unbilledWip.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.openAR.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {r.hours.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload history */}
      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4" />
              Upload History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {history.map((snap, i) => (
                <div
                  key={snap.id}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border',
                    i === 0 && 'border-primary/30 bg-primary/5',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-success" />
                    <div>
                      <p className="font-medium text-sm">
                        {snap.label}
                        {i === 0 && (
                          <Badge variant="default" className="ml-2 text-[10px]">
                            Current
                          </Badge>
                        )}
                        {i === 1 && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">
                            Prior
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {snap.fileName} • {new Date(snap.uploadedAt).toLocaleString()} •{' '}
                        {snap.rollups.length} projects
                      </p>
                    </div>
                  </div>
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card when no WIP uploaded */}
      {!current && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Info className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No WIP file uploaded yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              The ETC walkforward is using seed data (WIP 0410). Upload a fresh WIP file above to get live numbers.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

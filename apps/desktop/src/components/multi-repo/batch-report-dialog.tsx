import type { BatchReport } from '@worklens/contracts';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';

interface BatchReportDialogProps {
  report: BatchReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchReportDialog({ report, open, onOpenChange }: BatchReportDialogProps) {
  if (!report) return null;

  const isSuccess = report.failed === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isSuccess ? (
              <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="size-5 text-amber-500 shrink-0" />
            )}
            <DialogTitle className="capitalize">Batch {report.operation} Results</DialogTitle>
          </div>
          <DialogDescription>
            {report.succeeded} of {report.total} repositories processed successfully.
            {report.failed > 0 && ` ${report.failed} skipped or failed.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1">
          {report.results.map((res) => (
            <div
              key={res.repoId}
              className={`p-3 rounded-lg border text-sm flex items-start gap-3 transition-colors ${
                res.success
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : 'border-amber-500/20 bg-amber-500/5'
              }`}
            >
              {res.success ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="size-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-foreground truncate">{res.repoName}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                      res.success
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {res.success ? 'Success' : 'Skipped / Failed'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 break-words font-mono">
                  {res.message}
                </p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

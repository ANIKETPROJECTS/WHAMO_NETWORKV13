import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ValidationError } from "@/lib/validator";
import { AlertCircle, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: () => void;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function ValidationModal({
  isOpen,
  onClose,
  onGenerate,
  errors,
  warnings,
}: ValidationModalProps) {
  const hasErrors = errors.length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertCircle className="w-6 h-6 text-primary" />
            Network Validation Report
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {errors.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-destructive font-bold flex items-center gap-2">
                  <XCircle className="w-5 h-5" />
                  Errors ({errors.length})
                </h3>
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
                  {errors.map((err, i) => (
                    <div key={i} className="text-sm flex gap-2">
                      <span className="text-destructive font-mono">•</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-amber-600 font-bold flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Warnings ({warnings.length})
                </h3>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  {warnings.map((err, i) => (
                    <div key={i} className="text-sm flex gap-2">
                      <span className="text-amber-600 font-mono">•</span>
                      <span>{err.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errors.length === 0 && warnings.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
                <h3 className="text-lg font-semibold">Network is Valid</h3>
                <p className="text-muted-foreground">Everything looks good! You can proceed with generation.</p>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} data-testid="button-close-validation">
            Close
          </Button>
          <Button 
            onClick={onGenerate} 
            disabled={hasErrors}
            data-testid="button-generate-anyway"
            className={!hasErrors ? "bg-green-600 hover:bg-green-700" : ""}
          >
            {hasErrors ? "Fix Errors to Generate" : "Generate Anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

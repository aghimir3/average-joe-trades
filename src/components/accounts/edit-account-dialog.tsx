'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getBrokerInfo } from './broker';
import type { BrokerageAccount } from './types';

interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: BrokerageAccount | null;
  formName: string;
  formExternalId: string;
  formIsDefault: boolean;
  onFormNameChange: (value: string) => void;
  onFormExternalIdChange: (value: string) => void;
  onFormIsDefaultChange: (value: boolean) => void;
  onSave: () => void;
  isPending: boolean;
  error: Error | null;
}

export function EditAccountDialog({
  open,
  onOpenChange,
  account,
  formName,
  formExternalId,
  formIsDefault,
  onFormNameChange,
  onFormExternalIdChange,
  onFormIsDefaultChange,
  onSave,
  isPending,
  error,
}: EditAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>Update your account details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Broker</Label>
            <div className="flex items-center gap-2 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
              <div className={cn('w-3 h-3 rounded-full', getBrokerInfo(account?.broker || '').color)} />
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {getBrokerInfo(account?.broker || '').label}
              </span>
            </div>
            <p className="text-xs text-zinc-500">Broker cannot be changed after creation</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-name">Account Name</Label>
            <Input
              id="edit-name"
              value={formName}
              onChange={(e) => onFormNameChange(e.target.value)}
              placeholder="e.g., Individual, IRA"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-external-id">
              Account Number <span className="text-zinc-400">(optional)</span>
            </Label>
            <Input
              id="edit-external-id"
              value={formExternalId}
              onChange={(e) => onFormExternalIdChange(e.target.value)}
              placeholder="e.g., ****1234"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formIsDefault}
              onChange={(e) => onFormIsDefaultChange(e.target.checked)}
              disabled={account?.isDefault}
              className="rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-50"
            />
            <span className="text-sm text-zinc-700 dark:text-zinc-300">
              Set as default account
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={!formName.trim() || isPending}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </DialogFooter>

        {error && (
          <p className="text-sm text-red-600 mt-2">{error.message}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

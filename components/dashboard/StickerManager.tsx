'use client';

import { useState } from 'react';
import { assignStickerToStaff } from '@/actions/stickers';

interface Sticker {
  id: string;
  short_id: string;
  created_at: string;
  staff_profiles: { id: string; full_name: string } | null;
  establishments: { id: string; name: string } | null;
}

interface StaffMember {
  id: string;
  full_name: string;
  establishment_id: string;
}

interface Props {
  stickers: Sticker[];
  staffMembers: StaffMember[];
}

export function StickerManager({ stickers, staffMembers }: Props) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const handleAssign = async (stickerId: string, staffId: string) => {
    setError(null);
    const result = await assignStickerToStaff(stickerId, staffId);
    if ('error' in result) setError(result.error);
    else setAssigningId(null);
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Short ID</th>
              <th className="text-left px-4 py-3 font-medium">Assigned to</th>
              <th className="text-left px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {stickers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No stickers provisioned yet. Use the mobile app to encode new chips.
                </td>
              </tr>
            )}
            {stickers.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-3 font-mono font-medium">{s.short_id}</td>
                <td className="px-4 py-3">
                  {assigningId === s.id ? (
                    <select
                      autoFocus
                      className="border rounded px-2 py-1 text-sm"
                      onChange={(e) => {
                        if (e.target.value) handleAssign(s.id, e.target.value);
                      }}
                      defaultValue=""
                    >
                      <option value="" disabled>Select staff…</option>
                      {staffMembers.map((m) => (
                        <option key={m.id} value={m.id}>{m.full_name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={s.staff_profiles ? '' : 'text-muted-foreground'}>
                      {s.staff_profiles?.full_name ?? s.establishments?.name ?? 'Unassigned'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`/s/${s.short_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground font-mono underline"
                  >
                    /s/{s.short_id}
                  </a>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => setAssigningId(assigningId === s.id ? null : s.id)}
                    className="text-xs underline text-muted-foreground hover:text-foreground"
                  >
                    {assigningId === s.id ? 'Cancel' : 'Assign'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

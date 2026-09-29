"use client";

import { useEffect, useState } from "react";
import { KeyRound, Upload } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, createSSHKeyCredential, listSSHKeyCredentials, type SSHKeyCredential } from "@/lib/api";

// Three-state outcome of this picker, shared verbatim by every consumer
// (Configure VM, the VM detail page's SSH section, and VM Console's
// pre-connect chooser):
//   - "saved": an existing named credential was picked (or just created)
//     -- consumers that attach a credential to a VM record use
//     credentialId directly as ssh_key_credential_id.
//   - "ephemeral": a key was read from a local file -- never uploaded to
//     this platform, never persisted anywhere. Console sends privateKey
//     once on its WebSocket "connect" frame for that session only;
//     Configure VM/the detail page have no use for the raw bytes at all
//     (there is nothing to attach it to) and simply leave the VM keyless,
//     showing this only as an acknowledgement of the user's choice.
//   - "none": nothing selected yet.
export type SSHKeyPickerValue =
  | { mode: "saved"; credentialId: string; credentialName: string }
  | { mode: "ephemeral"; privateKey: string; fileName: string }
  | { mode: "none" };

export function SSHKeyPicker({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: SSHKeyPickerValue;
  onChange: (value: SSHKeyPickerValue) => void;
}) {
  const [credentials, setCredentials] = useState<SSHKeyCredential[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;
    listSSHKeyCredentials(workspaceId)
      .then((r) => setCredentials(r.credentials))
      .catch(() => setLoadError(true));
  }, [workspaceId]);

  // Independent of `value` -- switching tabs to look around must not
  // clobber whatever was already selected; `value` only changes when the
  // user actually completes an action (picks/creates a credential, picks
  // a file) inside the currently active tab.
  const [tab, setTab] = useState<"saved" | "direct">(value.mode === "ephemeral" ? "direct" : "saved");

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v === "direct" ? "direct" : "saved")}>
      <TabsList>
        <TabsTrigger value="saved">
          <KeyRound className="h-3.5 w-3.5" /> Named Credential
        </TabsTrigger>
        <TabsTrigger value="direct">
          <Upload className="h-3.5 w-3.5" /> Add Directly
        </TabsTrigger>
      </TabsList>

      <TabsContent value="saved" className="mt-3 flex flex-col gap-3">
        {loadError && <p className="text-sm text-red-600">Failed to load SSH key credentials.</p>}
        {!loadError && (
          <>
            <div>
              <Label htmlFor="ssh-key-credential">Credential</Label>
              <Select
                value={value.mode === "saved" ? value.credentialId : ""}
                onValueChange={(v) => {
                  const cred = credentials?.find((c) => c.id === v);
                  if (cred) onChange({ mode: "saved", credentialId: cred.id, credentialName: cred.name });
                }}
                disabled={!credentials || credentials.length === 0}
              >
                <SelectTrigger id="ssh-key-credential">
                  <SelectValue placeholder={credentials === null ? "Loading…" : credentials.length === 0 ? "No saved credentials yet" : "Select a credential"} />
                </SelectTrigger>
                <SelectContent>
                  {(credentials ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} <span className="text-muted-foreground">({c.fingerprint})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!showCreate ? (
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setShowCreate(true)}>
                + New Credential
              </Button>
            ) : (
              <CreateCredentialForm
                workspaceId={workspaceId}
                onCreated={(cred) => {
                  setCredentials((prev) => [...(prev ?? []), cred]);
                  onChange({ mode: "saved", credentialId: cred.id, credentialName: cred.name });
                  setShowCreate(false);
                }}
                onCancel={() => setShowCreate(false)}
              />
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="direct" className="mt-3 flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">
          Reads a key file straight from your device. It is never uploaded to this platform or saved here — you&rsquo;ll pick the file again each time you open the Console.
        </p>
        <Input
          type="file"
          accept=".pem,.key,text/plain,application/x-pem-file"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const text = await file.text();
            onChange({ mode: "ephemeral", privateKey: text, fileName: file.name });
          }}
        />
        {value.mode === "ephemeral" && <p className="text-xs text-emerald-700">Selected: {value.fileName}</p>}
      </TabsContent>
    </Tabs>
  );
}

function CreateCredentialForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  onCreated: (credential: SSHKeyCredential) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!name.trim()) {
      setError("Name the credential first.");
      return;
    }
    if (!key.trim()) {
      setError("Paste or select a private key.");
      return;
    }
    setSubmitting(true);
    try {
      const cred = await createSSHKeyCredential(workspaceId, name.trim(), key);
      onCreated(cred);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create the credential.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div>
        <Label htmlFor="new-ssh-key-name">Name</Label>
        <Input id="new-ssh-key-name" placeholder="e.g. prod-fleet-key" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
      </div>
      <div>
        <Label htmlFor="new-ssh-key-value">Private key</Label>
        <Textarea
          id="new-ssh-key-value"
          rows={6}
          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----&#10;...&#10;-----END OPENSSH PRIVATE KEY-----"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={submitting}
          className="font-mono text-xs"
        />
        <Input
          type="file"
          accept=".pem,.key,text/plain,application/x-pem-file"
          className="mt-2"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setKey(await file.text());
            if (!name.trim()) setName(file.name.replace(/\.(pem|key|txt)$/i, ""));
          }}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleSave} disabled={submitting}>
          {submitting ? "Saving…" : "Save Credential"}
        </Button>
      </div>
    </div>
  );
}

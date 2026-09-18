"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  id: string;
  merchantName: string | null;
  possibleOfficialUrl: string | null;
  title: string | null;
};

export default function ReviewClient(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [merchantName, setMerchantName] = useState(props.merchantName ?? "");
  const [possibleOfficialUrl, setPossibleOfficialUrl] = useState(
    props.possibleOfficialUrl ?? "",
  );
  const [title, setTitle] = useState(props.title ?? "");

  async function patch(body: object) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/discovery/${props.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Update failed.");
      }
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reviewActions">
      <button disabled={busy} onClick={() => patch({ action: "ACCEPT" })}>
        Accept
      </button>
      <button
        className="danger"
        disabled={busy}
        onClick={() => patch({ action: "REJECT" })}
      >
        Reject
      </button>
      <button
        className="warning"
        disabled={busy}
        onClick={() => patch({ action: "NEEDS_REVIEW" })}
      >
        Needs review
      </button>
      <button disabled={busy} onClick={() => setEditing((v) => !v)}>
        Edit
      </button>

      {editing && (
        <div className="editor">
          <label>
            Merchant
            <input
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
            />
          </label>
          <label>
            Official URL
            <input
              value={possibleOfficialUrl}
              onChange={(e) => setPossibleOfficialUrl(e.target.value)}
            />
          </label>
          <label>
            Evidence title
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              await patch({
                action: "EDIT",
                merchantName,
                possibleOfficialUrl,
                title,
              });
              setEditing(false);
            }}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}

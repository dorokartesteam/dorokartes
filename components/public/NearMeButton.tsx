"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NearMeButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  function locate() {
    if (!navigator.geolocation) {
      setState("error");
      return;
    }
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const lat = coords.latitude.toFixed(4);
        const lng = coords.longitude.toFixed(4);
        router.push(`/regions?lat=${lat}&lng=${lng}`);
      },
      () => setState("error"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <button className="dk28-near-me" type="button" onClick={locate} disabled={state === "loading"}>
      <span aria-hidden="true">⌖</span>
      {state === "loading" ? "Εντοπισμός…" : state === "error" ? "Δεν δόθηκε τοποθεσία" : "Κοντά μου"}
    </button>
  );
}

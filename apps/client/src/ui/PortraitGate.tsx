/**
 * Landscape prompt: shown only during gameplay when the phone is in portrait.
 * Pure CSS media query — gameplay resumes automatically on rotation.
 */
export function PortraitGate(): JSX.Element {
  return (
    <div className="portrait-gate gameplay-only">
      <div className="phone-rotate" />
      <h2 style={{ fontSize: "1.4rem", fontWeight: 900 }}>Rotate your phone!</h2>
      <p style={{ color: "var(--text-dim)", maxWidth: "18rem" }}>
        The Disaster Dome is best experienced in landscape. The match keeps running — flip your phone to jump back in.
      </p>
    </div>
  );
}

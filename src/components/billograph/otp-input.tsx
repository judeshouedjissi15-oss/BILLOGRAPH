"use client";

// SAISIE D'UN CODE À 6 CHIFFRES (style OTP) — composant accessible et
// optimisé mobile : auto-avance à la saisie, retour arrière intelligent,
// collage du code complet (ou partiel), navigation clavier par flèches,
// sélection automatique au focus pour remplacer un chiffre facilement.
// Le clavier numérique natif est demandé sur mobile (inputMode="numeric")
// et autoComplete="one-time-code" signale le code reçu par email.

import { useEffect, useRef } from "react";

export const OTP_LENGTH = 6;

type OtpInputProps = {
  /** Code complet (0 à 6 caractères) — contrôlé par le parent. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Appelé dès que le code est complet (6 chiffres). */
  onComplete?: (value: string) => void;
};

export function OtpInput({ value, onChange, disabled, autoFocus, onComplete }: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const completedRef = useRef<string | null>(null);

  const chars = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");

  // Signale une seule fois chaque complétion (et reset si le code est vidé).
  useEffect(() => {
    if (value.length === OTP_LENGTH) {
      if (completedRef.current !== value) {
        completedRef.current = value;
        onComplete?.(value);
      }
    } else {
      completedRef.current = null;
    }
  }, [value, onComplete]);

  const setCharAt = (index: number, char: string) => {
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
    next[index] = char;
    onChange(next.join(""));
  };

  const focusIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(OTP_LENGTH - 1, index));
    inputsRef.current[clamped]?.focus();
    inputsRef.current[clamped]?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      setCharAt(index, "");
      return;
    }

    // Distribue les chiffres saisis (ou collés) à partir de la case courante.
    const next = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
    let cursor = index;
    for (const digit of digits) {
      if (cursor >= OTP_LENGTH) break;
      next[cursor] = digit;
      cursor += 1;
    }
    onChange(next.join(""));
    focusIndex(cursor);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (chars[index]) {
        setCharAt(index, "");
      } else if (index > 0) {
        const next = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? "");
        next[index - 1] = "";
        onChange(next.join(""));
        focusIndex(index - 1);
      }
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusIndex(index - 1);
      return;
    }
    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      focusIndex(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!digits) return;
    onChange(digits);
    focusIndex(digits.length);
  };

  return (
    <div
      className="flex items-center justify-center gap-2"
      role="group"
      aria-label="Code de confirmation à 6 chiffres"
    >
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(el) => {
            inputsRef.current[index] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={1}
          required
          disabled={disabled}
          value={char}
          aria-label={`Chiffre ${index + 1} du code`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          className="h-14 w-11 rounded-lg border border-input bg-background text-center text-xl font-semibold tracking-tight shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-14 sm:w-12"
        />
      ))}
    </div>
  );
}

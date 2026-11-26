'use client';

import { useEffect, useRef, useState } from 'react';
import { moneyLabel } from '@/lib/format-money';
import {
  previewCoupon,
  readAppliedCouponCode,
  writeAppliedCouponCode,
  type CouponPreview,
} from '@/lib/applied-coupon';

type Props = {
  subtotal: number;
  /** The shopper's email when known, so a once-per-customer coupon is checked early. */
  email?: string;
  /** Called with the coupon the server accepted, or null when there is none. */
  onChange: (coupon: CouponPreview | null) => void;
};

/** Coupon box for the cart and checkout. The server decides what a code is worth. */
export default function CouponField({ subtotal, email, onChange }: Props) {
  const [input, setInput] = useState('');
  const [applied, setApplied] = useState<CouponPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const check = async (code: string, announceFailure: boolean) => {
    setChecking(true);
    const result = await previewCoupon(code, subtotal, email);
    setChecking(false);
    if (result.ok) {
      setApplied(result.coupon);
      writeAppliedCouponCode(result.coupon.code);
      setMessage('');
      setInput('');
      onChangeRef.current(result.coupon);
    } else {
      setApplied(null);
      writeAppliedCouponCode(null);
      onChangeRef.current(null);
      setMessage(announceFailure ? result.message : `Your coupon was removed. ${result.message}`);
    }
  };

  // Re-check a remembered code whenever the cart total changes: the discount depends on it.
  useEffect(() => {
    const saved = readAppliedCouponCode();
    if (!saved || !(subtotal > 0)) {
      if (!saved) {
        setApplied(null);
        onChangeRef.current(null);
      }
      return;
    }
    check(saved, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, email]);

  const remove = () => {
    setApplied(null);
    writeAppliedCouponCode(null);
    setMessage('');
    onChangeRef.current(null);
  };

  if (applied) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
        <p className="text-sm text-green-900">
          <span className="font-semibold">{applied.code}</span> applied: {moneyLabel(applied.discount)} off
        </p>
        <button type="button" onClick={remove} className="text-sm font-semibold text-gray-900 underline">
          Remove
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const code = input.trim();
        if (!code) {
          setMessage('Enter a coupon code.');
          return;
        }
        check(code, true);
      }}
    >
      <label htmlFor="coupon-code" className="block text-sm font-medium text-gray-900 mb-2">
        Coupon code
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase())}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={message ? 'coupon-message' : undefined}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
        />
        <button
          type="submit"
          disabled={checking}
          className="rounded-lg border border-gray-900 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-60 transition-colors"
        >
          {checking ? 'Checking…' : 'Apply'}
        </button>
      </div>
      <p id="coupon-message" role="status" className="mt-2 min-h-[1.25rem] text-sm text-red-700">
        {message}
      </p>
    </form>
  );
}

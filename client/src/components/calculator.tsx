import { useEffect, useRef, useState, useCallback } from "react";
import { X } from "lucide-react";

interface CalculatorProps {
  onClose: () => void;
}

type Op = "+" | "-" | "×" | "÷" | null;

export function Calculator({ onClose }: CalculatorProps) {
  const [display, setDisplay] = useState("0");
  const [operand, setOperand] = useState<number | null>(null);
  const [operator, setOperator] = useState<Op>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  // Drag state
  const [pos, setPos] = useState({ x: Math.max(0, window.innerWidth / 2 - 130), y: 80 });
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag handle (the header bar)
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 260, dragRef.current.startPosX + dx)),
      y: Math.max(0, Math.min(window.innerHeight - 360, dragRef.current.startPosY + dy)),
    });
  };

  const onPointerUp = () => { dragRef.current = null; };

  // Calculator logic
  const inputDigit = useCallback((digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaitingForOperand(false);
    } else {
      setDisplay(prev => prev === "0" ? digit : prev.length >= 12 ? prev : prev + digit);
    }
  }, [waitingForOperand]);

  const inputDecimal = useCallback(() => {
    if (waitingForOperand) { setDisplay("0."); setWaitingForOperand(false); return; }
    if (!display.includes(".")) setDisplay(prev => prev + ".");
  }, [display, waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay("0");
    setOperand(null);
    setOperator(null);
    setWaitingForOperand(false);
  }, []);

  const backspace = useCallback(() => {
    if (waitingForOperand) return;
    setDisplay(prev => prev.length > 1 ? prev.slice(0, -1) : "0");
  }, [waitingForOperand]);

  const toggleSign = useCallback(() => {
    setDisplay(prev => {
      const n = parseFloat(prev);
      return isNaN(n) ? prev : String(-n);
    });
  }, []);

  const percent = useCallback(() => {
    setDisplay(prev => {
      const n = parseFloat(prev);
      return isNaN(n) ? prev : String(n / 100);
    });
  }, []);

  const applyOperator = useCallback((nextOp: Op) => {
    const current = parseFloat(display);
    if (operand !== null && operator && !waitingForOperand) {
      let result = operand;
      if (operator === "+") result = operand + current;
      else if (operator === "-") result = operand - current;
      else if (operator === "×") result = operand * current;
      else if (operator === "÷") result = current !== 0 ? operand / current : 0;
      const resultStr = parseFloat(result.toFixed(10)).toString();
      setDisplay(resultStr);
      setOperand(result);
    } else {
      setOperand(current);
    }
    setOperator(nextOp);
    setWaitingForOperand(true);
  }, [display, operand, operator, waitingForOperand]);

  const calculate = useCallback(() => {
    if (operand === null || operator === null || waitingForOperand) return;
    const current = parseFloat(display);
    let result = operand;
    if (operator === "+") result = operand + current;
    else if (operator === "-") result = operand - current;
    else if (operator === "×") result = operand * current;
    else if (operator === "÷") result = current !== 0 ? operand / current : 0;
    const resultStr = parseFloat(result.toFixed(10)).toString();
    setDisplay(resultStr);
    setOperand(null);
    setOperator(null);
    setWaitingForOperand(true);
  }, [display, operand, operator, waitingForOperand]);

  // Keyboard support
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea other than our calculator
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.key >= "0" && e.key <= "9") { e.preventDefault(); inputDigit(e.key); }
      else if (e.key === ".") { e.preventDefault(); inputDecimal(); }
      else if (e.key === "+") { e.preventDefault(); applyOperator("+"); }
      else if (e.key === "-") { e.preventDefault(); applyOperator("-"); }
      else if (e.key === "*") { e.preventDefault(); applyOperator("×"); }
      else if (e.key === "/") { e.preventDefault(); applyOperator("÷"); }
      else if (e.key === "%" ) { e.preventDefault(); percent(); }
      else if (e.key === "Enter" || e.key === "=") { e.preventDefault(); calculate(); }
      else if (e.key === "Backspace") { e.preventDefault(); backspace(); }
      else if (e.key === "Escape") { e.preventDefault(); onClose(); }
      else if (e.key === "c" || e.key === "C" || e.key === "Delete") { e.preventDefault(); clear(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [inputDigit, inputDecimal, applyOperator, percent, calculate, backspace, clear, onClose]);

  const fmt = (val: string) => {
    // Show up to 12 chars; truncate if needed
    return val.length > 12 ? val.slice(0, 12) : val;
  };

  type BtnDef = { label: string; action: () => void; color?: string };

  const buttons: BtnDef[][] = [
    [
      { label: "C",   action: clear,                  color: "bg-red-100 text-red-700 hover:bg-red-200 font-semibold" },
      { label: "±",   action: toggleSign,              color: "bg-gray-200 text-gray-700 hover:bg-gray-300" },
      { label: "%",   action: percent,                 color: "bg-gray-200 text-gray-700 hover:bg-gray-300" },
      { label: "÷",   action: () => applyOperator("÷"), color: "bg-orange-400 text-white hover:bg-orange-500 font-semibold" },
    ],
    [
      { label: "7", action: () => inputDigit("7") },
      { label: "8", action: () => inputDigit("8") },
      { label: "9", action: () => inputDigit("9") },
      { label: "×", action: () => applyOperator("×"), color: "bg-orange-400 text-white hover:bg-orange-500 font-semibold" },
    ],
    [
      { label: "4", action: () => inputDigit("4") },
      { label: "5", action: () => inputDigit("5") },
      { label: "6", action: () => inputDigit("6") },
      { label: "−", action: () => applyOperator("-"), color: "bg-orange-400 text-white hover:bg-orange-500 font-semibold" },
    ],
    [
      { label: "1", action: () => inputDigit("1") },
      { label: "2", action: () => inputDigit("2") },
      { label: "3", action: () => inputDigit("3") },
      { label: "+", action: () => applyOperator("+"), color: "bg-orange-400 text-white hover:bg-orange-500 font-semibold" },
    ],
    [
      { label: "0",  action: () => inputDigit("0"),   color: "col-span-1" },
      { label: ".",  action: inputDecimal },
      { label: "⌫", action: backspace,                color: "bg-gray-200 text-gray-700 hover:bg-gray-300" },
      { label: "=",  action: calculate,               color: "bg-green-500 text-white hover:bg-green-600 font-semibold" },
    ],
  ];

  return (
    <div
      ref={popupRef}
      className="fixed z-[9999] rounded-xl shadow-2xl border border-gray-200 bg-white select-none"
      style={{ left: pos.x, top: pos.y, width: 256, touchAction: "none" }}
    >
      {/* Drag handle / header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-t-xl cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="text-xs text-gray-400 font-medium select-none">Calculator</span>
        <button
          className="text-gray-400 hover:text-white transition-colors rounded p-0.5"
          onClick={onClose}
          onPointerDown={e => e.stopPropagation()}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Display */}
      <div className="bg-gray-900 px-3 py-3 min-h-[60px] flex flex-col items-end justify-end">
        {operator && (
          <div className="text-gray-500 text-xs mb-0.5">
            {operand} {operator}
          </div>
        )}
        <div className="text-white text-2xl font-light tracking-tight break-all text-right leading-tight">
          {fmt(display)}
        </div>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-4 gap-px bg-gray-300 rounded-b-xl overflow-hidden">
        {buttons.flat().map((btn, i) => (
          <button
            key={i}
            className={`py-4 text-base font-medium transition-colors active:opacity-70 ${
              btn.color || "bg-white text-gray-800 hover:bg-gray-100"
            }`}
            onClick={btn.action}
            onPointerDown={e => e.stopPropagation()}
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}

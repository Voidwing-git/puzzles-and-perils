import type { PrivatePreparation } from './state.ts';

const prefix = 'arcane-pipes:private:m3:';
export function privateStorageKey(key:string){return prefix+key;}
export function discardPrivate(key:string){try{localStorage.removeItem(prefix+key);}catch{/* Cleanup must not turn a committed action into a failure. */}}
export function savePrivate(key: string, preparation: PrivatePreparation) {
  const encoded = JSON.stringify(preparation);
  try {
    localStorage.setItem(prefix + key, encoded);
    if (localStorage.getItem(prefix + key) !== encoded) throw new Error();
  } catch { throw new Error('Private save unavailable. Export the private puzzle before continuing.'); }
}
export function readPrivate(key: string): PrivatePreparation | null {
  try {
    const text = localStorage.getItem(prefix + key);
    return text ? JSON.parse(text) as PrivatePreparation : null;
  } catch { throw new Error('Private preparation unreadable or storage unavailable in this browser.'); }
}

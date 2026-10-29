import type { PrivatePreparation } from './state.ts';
import {validatePreparation} from './save-format.ts';

const prefix = 'arcane-pipes:private:m3:';
const validated=new Map<string,{text:string;preparation:PrivatePreparation}>();
export function privateStorageKey(key:string){return prefix+key;}
export function discardPrivate(key:string){validated.delete(key);try{localStorage.removeItem(prefix+key);}catch{/* Cleanup must not turn a committed action into a failure. */}}
export function savePrivate(key: string, preparation: PrivatePreparation) {
  validated.delete(key);
  const encoded = JSON.stringify(preparation);
  try {
    localStorage.setItem(prefix + key, encoded);
    if (localStorage.getItem(prefix + key) !== encoded) throw new Error();
  } catch { throw new Error('Private save unavailable. Export the private puzzle before continuing.'); }
}
// Read the actual storage bytes every time, including same-window changes.
// Cache only successful validation, and return detached copies to every caller.
export function readValidatedPrivate(key:string):PrivatePreparation|null{
  let text:string|null;
  try{text=localStorage.getItem(prefix+key);}catch{validated.delete(key);throw new Error('Private preparation unreadable or storage unavailable in this browser.');}
  if(text===null){validated.delete(key);return null;}
  const cached=validated.get(key);
  if(cached?.text===text)return structuredClone(cached.preparation);
  validated.delete(key);
  let raw:unknown;try{raw=JSON.parse(text);}catch{throw new Error('Private preparation unreadable or storage unavailable in this browser.');}
  const preparation=validatePreparation(raw);
  if(validated.size>=8)validated.delete(validated.keys().next().value!);
  validated.set(key,{text,preparation});return structuredClone(preparation);
}
export function readPrivate(key: string): PrivatePreparation | null {
  try {
    const text = localStorage.getItem(prefix + key);
    return text ? JSON.parse(text) as PrivatePreparation : null;
  } catch { throw new Error('Private preparation unreadable or storage unavailable in this browser.'); }
}

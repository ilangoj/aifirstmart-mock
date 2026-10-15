/* AIFirstMart mock: Phase 2 and 3 features.
 * - Two roles: Payment approver (Kumar) and Customer (shop view).
 * - Refunds and payments: approve within limit, second approver above the owner threshold, Finance reconciles.
 * - Customer shop: web shop, mobile app and WhatsApp on one cart; sign-in, checkout, tracking and returns.
 * - Training records: lesson search, own progress, team records in the shared database.
 * - Price changes: bulk change by category, scheduled effective dates, price history.
 * - Exports and printing for owners; text size, focus outlines and one-role matrix view.
 * - One policy everywhere: original screens also obey the published Access policy. */
(() => {
'use strict';
if (window.__afmPhase2) return; window.__afmPhase2 = true;
const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const rs = n => '₹' + Number(n).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const persona = () => { try { return session.activePersona; } catch (e) { return ''; } };
const audit = (a, b, c) => { try { auditEvent(a, b, c); } catch (e) {} };
const say = m => { try { toast(m); } catch (e) {} };
const POL = () => window.AFMPolicy;
const pcan = (perm, who = persona()) => { const P = POL(); return P ? P.can(perm, who) : false; };
const load = (k, d) => { try { return Object.assign(d(), JSON.parse(localStorage.getItem(k) || 'null') || {}); } catch (e) { return d(); } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const today = () => new Date().toISOString().slice(0, 10);
const nowT = () => new Date().toLocaleString('en-IN', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const ME = {manager: 'U2', payments: 'U9', finance: 'U6', admin: 'U5', cashier: 'U1', oms: 'U3', inventory: 'U4', procurement: 'U7'};
const meUser = () => POL()?.state().users.find(u => u.id === ME[persona()]);
const meName = () => persona() === 'owner' ? 'Business owner' : (meUser()?.name || (typeof personaLabel === 'function' ? personaLabel(persona()) : persona()));


#!/usr/bin/env node
import { loadBooks, planAll, approve, sendApproved, sync, followUps, rows, loadLedger } from './desk.mjs';

const [cmd = 'plan', arg] = process.argv.slice(2);
const books = await loadBooks();
if (cmd === 'plan') await planAll(books);
else if (cmd === 'approve') await approve(arg);
else if (cmd === 'send') console.log('sent:', (await sendApproved(books)).sent.join(', ') || 'none');
else if (cmd === 'sync') await sync();
else if (cmd === 'followup') console.log('reminded:', (await followUps(books)).reminded.join(', ') || 'none');
else if (cmd !== 'show') { console.error('usage: cli.mjs plan|approve <ref>|send|sync|followup|show'); process.exit(2); }
console.table(rows(books, await loadLedger()).map(({ message, reason, payer_url, ...r }) => r));

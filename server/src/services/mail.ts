import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import env from '../lib/env.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (transporter) return transporter;
  if (env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  } else {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendMailArgs {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}

const INBOX_DIR = path.resolve('./data/outbox');

export async function sendMail(args: SendMailArgs): Promise<{ preview: string | null }> {
  const t = getTransporter();
  const info = await t.sendMail({
    from: env.EMAIL_FROM,
    to: Array.isArray(args.to) ? args.to.join(', ') : args.to,
    subject: args.subject,
    html: args.html,
    text: args.text ?? args.html.replace(/<[^>]+>/g, ' '),
    attachments: args.attachments,
  });

  if (!env.SMTP_HOST) {
    try {
      if (!fs.existsSync(INBOX_DIR)) fs.mkdirSync(INBOX_DIR, { recursive: true });
      const filename = `${Date.now()}-${(args.subject ?? 'mail').replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.json`;
      fs.writeFileSync(
        path.join(INBOX_DIR, filename),
        JSON.stringify(
          {
            to: args.to,
            subject: args.subject,
            html: args.html,
            attachments: (args.attachments ?? []).map((a) => ({ filename: a.filename, size: a.content.length })),
          },
          null,
          2,
        ),
        'utf8',
      );
      for (const att of args.attachments ?? []) {
        fs.writeFileSync(path.join(INBOX_DIR, `${Date.now()}-${att.filename}`), att.content);
      }
      console.log(`[mail] (dev) saved to ${INBOX_DIR}`);
    } catch (err) {
      console.warn('[mail] could not save dev mail:', err);
    }
  }

  return { preview: nodemailer.getTestMessageUrl(info) || null };
}

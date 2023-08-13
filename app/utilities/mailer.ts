import { MAIL_PASSWORD, MAIL_USER, MAIN_HOST } from '../../config/services';
import nodemailer from 'nodemailer';

export const mailer = nodemailer.createTransport({
  host: MAIN_HOST,
  port: 465,
  secure: true, // upgrade later with STARTTLS
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASSWORD,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

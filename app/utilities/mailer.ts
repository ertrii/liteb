import nodemailer from 'nodemailer';
import { ConfigService } from './config-service';

export const mailer = nodemailer.createTransport({
  host: ConfigService.get('MAIL_HOST'),
  port: 465,
  secure: true, // upgrade later with STARTTLS
  auth: {
    user: ConfigService.get('MAIL_USER'),
    pass: ConfigService.get('MAIL_PASSWORD'),
  },
  tls: {
    rejectUnauthorized: false,
  },
});

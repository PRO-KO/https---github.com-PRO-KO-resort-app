"use strict";

/**
 * server/mailer.js - Node.js v10 compatible internal SMTP mailer.
 */

require('dotenv').config();
var nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (err) {
  nodemailer = null;
}
var MAIL_ENABLED = process.env.MAIL_ENABLED === 'true';
var MAIL_INTERNAL_DOMAIN = process.env.MAIL_INTERNAL_DOMAIN || 'kosha-kms1.kosha.or.kr';
function internalEmailFor(empId) {
  return String(empId || '').trim().toLowerCase() + '@' + MAIL_INTERNAL_DOMAIN;
}
function createTransporter() {
  if (!nodemailer) return null;
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST || '192.168.1.10',
    port: Number(process.env.MAIL_PORT) || 25,
    secure: process.env.MAIL_SECURE === 'true',
    auth: process.env.MAIL_USER ? {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    } : undefined,
    tls: {
      rejectUnauthorized: false
    },
    connectionTimeout: Number(process.env.MAIL_CONNECTION_TIMEOUT || 5000),
    greetingTimeout: Number(process.env.MAIL_GREETING_TIMEOUT || 3000),
    socketTimeout: Number(process.env.MAIL_SOCKET_TIMEOUT || 10000)
  });
}
var transporter = createTransporter();
async function verifyMailer() {
  if (!MAIL_ENABLED) {
    console.log('[MAIL] Mail disabled (MAIL_ENABLED=false)');
    return;
  }
  if (!transporter) {
    console.warn('[MAIL] nodemailer is not installed. Mail sending disabled.');
    return;
  }
  try {
    await transporter.verify();
    console.log('[MAIL] SMTP connection OK: ' + (process.env.MAIL_HOST || '192.168.1.10') + ':' + (process.env.MAIL_PORT || 25));
  } catch (err) {
    console.warn('[MAIL] SMTP connection failed:', err.message);
  }
}
async function send(options) {
  options = options || {};
  if (!MAIL_ENABLED) {
    console.log('[MAIL] skipped (MAIL_ENABLED=false)');
    console.log('  TO     : ' + (Array.isArray(options.to) ? options.to.join(', ') : options.to));
    console.log('  SUBJECT: ' + options.subject);
    console.log('  BODY   : ' + String(options.text || '').slice(0, 200));
    return null;
  }
  if (!transporter) {
    console.warn('[MAIL] nodemailer is not installed. Cannot send:', options.subject);
    return null;
  }
  try {
    var info = await transporter.sendMail({
      from: process.env.MAIL_FROM || 'resort@kosha.or.kr',
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || undefined
    });
    console.log('[MAIL] sent -> ' + options.to + ' | messageId: ' + info.messageId);
    return info;
  } catch (err) {
    console.error('[MAIL] send failed:', err.message);
    return null;
  }
}
async function mailNewRegister(info) {
  info = info || {};
  return send({
    to: process.env.MAIL_ADMIN || 'admin@kosha.or.kr',
    subject: '[휴양소 예약] 신규 가입 신청 - 승인 요청',
    text: ['안녕하십니까.', '', '휴양소 예약 시스템에 신규 가입 신청이 접수되었습니다.', '관리자 페이지에서 확인 후 승인 또는 거절 처리 바랍니다.', '', '  사번     : ' + (info.empId || ''), '  소속기관  : ' + (info.organization || '미기재'), '  부서     : ' + (info.department || '미기재'), '', '※ 이 메일은 자동 발송되었습니다.'].join('\n')
  });
}
async function mailAccountApproved(info) {
  info = info || {};
  return send({
    to: info.empEmail || internalEmailFor(info.empId),
    subject: '[휴양소 예약] 계정 가입이 승인되었습니다',
    text: [(info.empId || '') + ' 님, 안녕하십니까.', '', '휴양소 예약 시스템 계정 가입이 승인되었습니다.', '내부망 예약 시스템에 접속하여 예약을 신청하실 수 있습니다.', '', '감사합니다.', '안전보건공단 발전기금 사업팀 드림'].join('\n')
  });
}
async function mailAccountRejected(info) {
  info = info || {};
  return send({
    to: info.empEmail || internalEmailFor(info.empId),
    subject: '[휴양소 예약] 계정 가입 신청 결과 안내',
    text: [(info.empId || '') + ' 님, 안녕하십니까.', '', '죄송합니다. 휴양소 예약 시스템 계정 가입 신청이 승인되지 않았습니다.', info.reason ? '  사유: ' + info.reason : '', '문의사항은 담당 부서로 연락 바랍니다.', '', '안전보건공단 발전기금 사업팀 드림'].join('\n')
  });
}
async function mailLotteryResult(info) {
  info = info || {};
  var isSelected = info.status === 'selected' || info.status === 'manual';
  var roomLabel = info.roomType || '';
  return send({
    to: info.empEmail || internalEmailFor(info.empId),
    subject: isSelected ? '[휴양소 예약] 축하합니다! ' + info.month + '월 추첨 당첨 안내' : '[휴양소 예약] ' + info.month + '월 추첨 결과 안내',
    text: isSelected ? [(info.empId || '') + ' 님, 안녕하십니까.', '', info.month + '월 휴양소 예약 추첨에 당첨되셨습니다. 축하드립니다!', '', '  객실 유형  : ' + roomLabel, '  숙박 일수  : ' + info.nights + '박', '', '상세 일정은 담당 부서에서 별도 안내드릴 예정입니다.', '감사합니다.', '', '안전보건공단 발전기금 사업팀 드림'].join('\n') : [(info.empId || '') + ' 님, 안녕하십니까.', '', info.month + '월 휴양소 예약 추첨 결과 다음 기회를 기약해 주시기 바랍니다.', '다음 달 예약 신청도 많은 관심 부탁드립니다.', '', '감사합니다.', '안전보건공단 발전기금 사업팀 드림'].join('\n')
  });
}
async function mailCancellation(info) {
  info = info || {};
  return send({
    to: info.empEmail || internalEmailFor(info.empId),
    subject: '[휴양소 예약] ' + info.month + '월 예약 신청 취소 확인',
    text: [(info.empId || '') + ' 님, 안녕하십니까.', '', info.month + '월 휴양소 예약 신청이 취소 처리되었습니다.', '', '문의사항은 담당 부서로 연락 바랍니다.', '', '안전보건공단 발전기금 사업팀 드림'].join('\n')
  });
}
module.exports = {
  verifyMailer: verifyMailer,
  internalEmailFor: internalEmailFor,
  mailNewRegister: mailNewRegister,
  mailAccountApproved: mailAccountApproved,
  mailAccountRejected: mailAccountRejected,
  mailLotteryResult: mailLotteryResult,
  mailCancellation: mailCancellation
};
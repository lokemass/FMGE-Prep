import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

// Cryptographically random runtime signing key; hydrated/persisted automatically in MongoDB on boot
let jwtSigningKey = crypto.randomBytes(32).toString('hex');

export function setJwtSigningKey(secret: string): void {
  if (typeof secret === 'string' && secret.trim().length >= 32) {
    jwtSigningKey = secret.trim();
  }
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthTokenPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, jwtSigningKey, { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, jwtSigningKey) as AuthTokenPayload;
    if (decoded && typeof decoded.userId === 'string' && typeof decoded.email === 'string') {
      return { userId: decoded.userId, email: decoded.email };
    }
    return null;
  } catch {
    return null;
  }
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (token) {
    const payload = verifyAuthToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in to save and access your personal data.' });
    return;
  }
  const payload = verifyAuthToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }
  req.user = payload;
  next();
}

export interface AdminTokenPayload {
  role: 'admin';
  email?: string;
}

export function isAdminEmail(email?: string): boolean {
  if (!email) return false;
  const allowlist = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.trim().toLowerCase());
}

export function signAdminToken(email?: string): string {
  return jwt.sign({ role: 'admin', email }, jwtSigningKey, { expiresIn: '12h' });
}

export function verifyAdminBearer(req: Request): AdminTokenPayload | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, jwtSigningKey) as Record<string, unknown>;
    if (decoded?.role === 'admin') {
      return { role: 'admin', email: typeof decoded.email === 'string' ? decoded.email : undefined };
    }
    if (typeof decoded?.email === 'string' && isAdminEmail(decoded.email)) {
      return { role: 'admin', email: decoded.email };
    }
    return null;
  } catch {
    return null;
  }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const admin = verifyAdminBearer(req);
  if (!admin) {
    res.status(403).json({ error: 'Admin authorization required.' });
    return;
  }
  next();
}

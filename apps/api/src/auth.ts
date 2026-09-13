import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

const COOKIE_NAME = "job_token";

export interface AuthUser {
  id: string;
  email: string;
}

interface JwtPayload {
  sub: string;
  email: string;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function signToken(user: AuthUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
    },
    config.JWT_SECRET,
    {
      expiresIn: "7d",
    },
  );
}

export function setAuthCookie(res: Response, user: AuthUser): void {
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: config.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = req.cookies[COOKIE_NAME];

  if (!token || typeof token !== "string") {
    res.status(401).json({
      error: "Authentication required",
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.sub !== "string" ||
      typeof decoded.email !== "string"
    ) {
      res.status(401).json({
        error: "Invalid authentication token",
      });
      return;
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
    };

    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function getAuthenticatedUser(req: Request): AuthUser {
  if (!req.user) {
    throw new Error("Authenticated user is missing");
  }

  return req.user;
}
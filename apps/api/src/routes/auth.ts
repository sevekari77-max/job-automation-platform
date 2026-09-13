import { Router } from "express";
import {
  loginSchema,
  registerSchema,
} from "@job-platform/shared";
import { prisma } from "../db";
import {
  clearAuthCookie,
  getAuthenticatedUser,
  hashPassword,
  requireAuth,
  setAuthCookie,
  verifyPassword,
} from "../auth";
import { authRateLimit } from "../security";

export const authRouter = Router();

authRouter.use(authRateLimit);

authRouter.post("/register", async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(409).json({
        error: "An account with that email already exists",
      });
      return;
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
      },
    });

    setAuthCookie(res, user);

    res.status(201).json({
      user,
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      res.status(401).json({
        error: "Invalid email or password",
      });
      return;
    }

    setAuthCookie(res, {
      id: user.id,
      email: user.email,
    });

    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);

  res.status(200).json({
    message: "Logged out",
  });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    user: getAuthenticatedUser(req),
  });
});
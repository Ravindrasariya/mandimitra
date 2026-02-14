import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { storage } from "./storage";
import type { User } from "@shared/schema";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      name: string;
      password: string;
      phone: string | null;
      businessId: number;
      role: string;
      mustChangePassword: boolean;
      createdAt: Date;
    }
  }
}

export function setupAuth(app: Express): void {
  const PgSession = connectPgSimple(session);

  const sessionMiddleware = session({
    store: new PgSession({
      pool,
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "mandi-mitra-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) return done(null, false, { message: "Invalid username" });

        const isValid = await comparePasswords(password, user.password);
        if (!isValid) return done(null, false, { message: "Invalid password" });

        if (user.role !== "system_admin") {
          const business = await storage.getBusiness(user.businessId);
          if (!business) return done(null, false, { message: "Business not found" });
          if (business.status === "inactive") return done(null, false, { message: "Your business account has been deactivated. Please contact the administrator." });
          if (business.status === "archived") return done(null, false, { message: "Your business account has been archived. Please contact the administrator." });
        }

        return done(null, user as Express.User);
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user as Express.User | undefined);
    } catch (err) {
      done(err);
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Login failed" });

      req.logIn(user, (err) => {
        if (err) return next(err);
        const { password, ...safeUser } = user;
        return res.json(safeUser);
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    const { password, ...safeUser } = req.user!;
    res.json(safeUser);
  });

  app.post("/api/auth/change-password", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    const { currentPassword, newPassword, phone } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters" });
    }

    const user = await storage.getUser(req.user!.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.mustChangePassword) {
      if (phone && phone !== user.phone) {
        return res.status(400).json({ message: "Mobile number does not match our records" });
      }
    } else {
      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) return res.status(400).json({ message: "Current password is incorrect" });
    }

    const hashed = await hashPassword(newPassword);
    await storage.updateUserPassword(user.id, hashed);

    if (phone) {
      await storage.updateUser(user.id, { phone });
    }

    const { password, ...safeUser } = user;
    res.json({ ...safeUser, mustChangePassword: false });
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    const { username, phone, newPassword } = req.body;
    if (!username || !phone || !newPassword) {
      return res.status(400).json({ message: "Username, mobile number, and new password are required" });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ message: "Password must be at least 4 characters" });
    }

    const user = await storage.getUserByUsername(username);
    if (!user) {
      return res.status(400).json({ message: "Invalid username or mobile number" });
    }
    if (!user.phone || user.phone !== phone) {
      return res.status(400).json({ message: "Invalid username or mobile number" });
    }

    const hashed = await hashPassword(newPassword);
    await storage.updateUserPassword(user.id, hashed);
    await storage.updateUser(user.id, { mustChangePassword: false });

    res.json({ message: "Password changed successfully" });
  });
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
  if (req.user!.role !== "system_admin") {
    const business = await storage.getBusiness(req.user!.businessId);
    if (!business || business.status !== "active") {
      req.logout(() => {});
      return res.status(403).json({ message: "Your business account has been deactivated or archived. Please contact the administrator." });
    }
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
  if (req.user!.role !== "system_admin") return res.status(403).json({ message: "Access denied" });
  next();
};

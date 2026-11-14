import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, Mail, Shield, AlertCircle } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { setTokens, fetchSession } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || "/app/dashboard";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const resp = await apiClient.post<{ access: string; refresh: string }>("/auth/login/", {
        email,
        password,
      });
      setTokens(resp.data.access, resp.data.refresh);
      await fetchSession();
      navigate(from, { replace: true });
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center studio-grid-bg px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Sign in to AI WarRoom</h1>
          <p className="mt-1 text-xs text-surface-400">
            Virtual Business Simulation & Decision Intelligence Platform
          </p>
        </div>

        <div className="panel-elevated p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger-500/40 bg-danger-500/10 px-3 py-2.5 text-xs text-danger-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="field-label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@company.com"
                  className="field pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field pl-9 pr-9"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full justify-center py-2.5"
            >
              {submitting ? "Signing in..." : (
                <>
                  Sign in <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="border-t border-surface-800 pt-3 text-center">
            <p className="text-[11px] font-mono text-surface-400">
              Demo: demo@aiwarroom.local / DemoPass123!
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-surface-400">
          New to AI WarRoom?{" "}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}

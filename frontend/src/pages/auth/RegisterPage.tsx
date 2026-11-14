import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, Building2, Eye, EyeOff, Lock, Mail, Shield, User } from "lucide-react";
import { apiClient, extractApiError } from "../../api/client";
import { useAuthStore } from "../../stores/authStore";

export function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { setTokens, setActiveOrgId, fetchSession } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const regResp = await apiClient.post<{ tokens: { access: string; refresh: string } }>("/auth/register/", {
        email,
        full_name: fullName,
        password,
        password_confirm: passwordConfirm,
      });
      setTokens(regResp.data.tokens.access, regResp.data.tokens.refresh);
      const orgName = workspaceName.trim() || `${fullName || email.split("@")[0]}'s Workspace`;
      const orgResp = await apiClient.post<{ id: string }>("/organizations/", { name: orgName });
      setActiveOrgId(orgResp.data.id);
      await fetchSession();
      navigate("/app/dashboard", { replace: true });
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center studio-grid-bg py-10 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-600 text-white mb-4">
            <Shield className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Create your account</h1>
          <p className="mt-1 text-xs text-surface-400">
            Test assumptions in a controlled virtual environment before committing capital
          </p>
        </div>

        <div className="panel-elevated p-6 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger-500/40 bg-danger-500/10 px-3 py-2.5 text-xs text-danger-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-danger-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="fullName" className="field-label">
                Full name <span className="text-brand-400">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Mehta"
                  className="field pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="workspaceName" className="field-label">Workspace name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="workspaceName"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="FreshCart Labs"
                  className="field pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="field-label">
                Email address <span className="text-brand-400">*</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@company.com"
                  className="field pl-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="field-label">
                Password (min 8 chars) <span className="text-brand-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="field pl-9 pr-9"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-200"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="passwordConfirm" className="field-label">
                Confirm password <span className="text-brand-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
                <input
                  id="passwordConfirm"
                  type="password"
                  required
                  minLength={8}
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  className="field pl-9"
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full justify-center py-2.5 mt-2">
              {submitting ? "Creating workspace..." : (
                <>
                  Create account & workspace <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-surface-400">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

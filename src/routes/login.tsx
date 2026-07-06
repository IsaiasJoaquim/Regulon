import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { account } from "@/lib/appwrite";
import { toast } from "sonner";
import { Sparkles, Loader2 } from "lucide-react";
import { ID } from "appwrite";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [isRegister, setIsRegister] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    
    setBusy(true);
    try {
      if (isRegister) {
        await account.create(ID.unique(), email, password);
        toast.success("Account created! Logging in...");
      }
      
      await account.createEmailPasswordSession(email, password);
      toast.success("Logged in successfully");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 font-bold text-2xl mb-8">
          <span className="w-8 h-8 rounded bg-primary text-primary-foreground grid place-items-center text-sm font-bold">R</span>
          Regulon
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>{isRegister ? "Create an account" : "Welcome back"}</CardTitle>
            <CardDescription>
              {isRegister ? "Sign up to start tracking compliance" : "Enter your credentials to access your dashboard"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="you@example.com" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  required 
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {isRegister ? "Sign Up" : "Sign In"}
              </Button>
            </form>
            
            <div className="mt-4 text-center text-sm">
              <button 
                type="button" 
                onClick={() => setIsRegister(!isRegister)}
                className="text-primary hover:underline"
              >
                {isRegister ? "Already have an account? Sign in" : "Need an account? Sign up"}
              </button>
            </div>
            
            <div className="mt-6 border-t pt-4">
              <Button 
                variant="outline" 
                className="w-full"
                type="button"
                onClick={() => {
                  toast.success("Using offline demo mode");
                  // Fallback without appwrite session
                  window.location.href = '/'; 
                }}
              >
                Test Offline (Without Appwrite)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

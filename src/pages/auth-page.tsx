import { useId, useState, type FormEvent } from "react"
import { getRouteApi, Link, useRouter } from "@tanstack/react-router"
import { EyeIcon, EyeOffIcon, LoaderCircleIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAccount, useSignIn, useSignOut, useSignUp } from "@/features/account/api"
import { errorMessage } from "@/lib/api"
import { safeRedirect } from "@/lib/redirect"
import { LIMITS } from "@/lib/constants"

/** The routes' search parameters (`?redirect=`). */
const signInRoute = getRouteApi("/sign-in")
const signUpRoute = getRouteApi("/sign-up")

/** Route `/sign-in`. */
export function SignInPage() {
  return <AuthPage mode="sign-in" redirect={signInRoute.useSearch().redirect} />
}

/** Route `/sign-up`. */
export function SignUpPage() {
  return <AuthPage mode="sign-up" redirect={signUpRoute.useSearch().redirect} />
}

/**
 * The form, or, for someone already signed in (an old link, the back button), who they are and
 * where to go next.
 * @param props.mode - Sign in or sign up.
 * @param props.redirect - Where to go afterwards.
 */
function AuthPage({ mode, redirect }: { mode: "sign-in" | "sign-up"; redirect?: string }) {
  const account = useAccount().data
  const signOut = useSignOut()
  // Once the form succeeds the account is signed in too; the form then moves on by itself.
  const [submitted, setSubmitted] = useState(false)

  if (account?.signedIn && !submitted) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-soft sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight">You're signed in</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">as {account.email}</p>
          <div className="mt-6 grid gap-2">
            <Button size="lg" asChild>
              <Link to={safeRedirect(redirect)}>Continue</Link>
            </Button>
            <Button variant="ghost" once disabled={signOut.isPending} onClick={() => signOut.mutate()}>
              Use another account
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <AuthForm mode={mode} redirect={redirect} onSubmitted={() => setSubmitted(true)} />
}

/** The texts of each mode. */
const copy = {
  "sign-in": {
    title: "Welcome back",
    text: "Sign in to see your saved designs on any device.",
    submit: "Sign in",
    busy: "Signing in…",
    done: "Signed in",
    switchText: "New to DesignApp?",
    switchLink: "Create an account",
  },
  "sign-up": {
    title: "Create your account",
    text: "Save your designs and open them on any device. Rooms you're editing in this browser come with you.",
    submit: "Create account",
    busy: "Creating your account…",
    done: "Account created",
    switchText: "Already have an account?",
    switchLink: "Sign in",
  },
} as const

/**
 * The email and password form for signing in or up. On success it goes back to where the user
 * came from (the `redirect` search parameter), or home.
 * @param props.mode - Sign in or sign up.
 * @param props.redirect - Where to go afterwards.
 * @param props.onSubmitted - Called when the form is sent.
 */
function AuthForm({ mode, redirect, onSubmitted }: { mode: "sign-in" | "sign-up"; redirect?: string; onSubmitted: () => void }) {
  const router = useRouter()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const submit = mode === "sign-in" ? signIn : signUp
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const id = useId()
  const text = copy[mode]
  const error = submit.error ? errorMessage(submit.error) : null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    onSubmitted()
    submit.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          toast.success(text.done)
          router.history.push(safeRedirect(redirect))
        },
      },
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">{text.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{text.text}</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor={`${id}-email`}>Email</Label>
            <Input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error !== null}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${id}-password`}>Password</Label>
            <div className="relative">
              <Input
                id={`${id}-password`}
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                required
                minLength={mode === "sign-up" ? LIMITS.minPasswordLength : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error !== null}
                aria-describedby={mode === "sign-up" ? `${id}-hint` : undefined}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1.5 -translate-y-1/2"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </Button>
            </div>
            {mode === "sign-up" && (
              <p id={`${id}-hint`} className="text-xs text-muted-foreground">
                At least {LIMITS.minPasswordLength} characters.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" className="w-full" once disabled={submit.isPending}>
            {submit.isPending && <LoaderCircleIcon data-icon="inline-start" className="animate-spin motion-reduce:animate-none" />}
            {submit.isPending ? text.busy : text.submit}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {text.switchText}{" "}
          <Link
            to={mode === "sign-in" ? "/sign-up" : "/sign-in"}
            search={redirect ? { redirect } : {}}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {text.switchLink}
          </Link>
        </p>
      </div>
    </div>
  )
}

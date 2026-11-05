import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { getJson, sendJson } from "@/lib/api"

/** Who is signed in (mirrors the API's AccountResponse). */
export type Account = {
  /** Whether an account is signed in; otherwise the browser is a guest. */
  signedIn: boolean
  /** The account's email, when signed in. */
  email: string | null
}

/** An email and a password, for signing up or in. */
export type Credentials = { email: string; password: string }

/** The shortest password the API accepts (mirrors AccountSetup.MinPasswordLength). */
export const MIN_PASSWORD_LENGTH = 8

/** React Query cache key of the account. */
export const accountKey = ["account"] as const

/** Loads who is signed in. */
export function useAccount() {
  return useQuery({
    queryKey: accountKey,
    queryFn: ({ signal }) => getJson<Account>("/api/account", signal),
    staleTime: 60_000,
  })
}

/**
 * After signing up, in or out, everything cached belongs to someone else: the account is set
 * and all other data is fetched again (signing in also brings this browser's guest rooms along).
 */
function useAccountChange() {
  const queryClient = useQueryClient()
  return (account: Account) => {
    queryClient.setQueryData(accountKey, account)
    void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== accountKey[0] })
  }
}

/** Creates an account and signs in. Fails with the API's message (email taken, password too short). */
export function useSignUp() {
  const changed = useAccountChange()
  return useMutation({
    mutationFn: (credentials: Credentials) => sendJson<Account>("POST", "/api/account/sign-up", credentials),
    onSuccess: changed,
  })
}

/** Signs in. Fails with the API's message (wrong email or password, locked for a few minutes). */
export function useSignIn() {
  const changed = useAccountChange()
  return useMutation({
    mutationFn: (credentials: Credentials) => sendJson<Account>("POST", "/api/account/sign-in", credentials),
    onSuccess: changed,
  })
}

/** Signs out; the browser continues as a new guest. */
export function useSignOut() {
  const changed = useAccountChange()
  return useMutation({
    mutationFn: () => sendJson<void>("POST", "/api/account/sign-out"),
    onSuccess: () => changed({ signedIn: false, email: null }),
  })
}

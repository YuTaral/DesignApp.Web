import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr"

import { apiUrl } from "@/lib/api"
import { roomKeys } from "./api"
import { isAnalysisFinished, type Room } from "./types"

/**
 * Keeps a room's cached data live while its analysis runs: connects to the API's SignalR hub,
 * watches the room and writes every pushed change into the React Query cache. Disconnects once
 * the analysis has finished. If the connection fails, {@link useRoom}'s polling still catches up.
 * @param roomId - The room to watch.
 * @param finished - Whether the analysis is already over (then nothing connects).
 */
export function useLiveRoom(roomId: string, finished: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (finished) return

    const update = (room: Room) => queryClient.setQueryData(roomKeys.detail(room.id), room)
    const connection = new HubConnectionBuilder()
      .withUrl(apiUrl("/api/hubs/rooms"))
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build()

    connection.on("RoomChanged", (room: Room) => {
      update(room)
      if (isAnalysisFinished(room.status)) void connection.stop()
    })
    // Watch returns the current state, which also covers anything missed while reconnecting.
    const watch = () => connection.invoke<Room>("Watch", roomId).then(update)
    connection.onreconnected(() => void watch().catch(() => {}))

    // Start on the next tick: React's development double-mount runs this effect's cleanup
    // straight away, and stopping a connection mid-negotiation logs a misleading error.
    const start = setTimeout(() => {
      connection
        .start()
        .then(watch)
        .catch(() => {}) // polling in useRoom covers a failed connection
    }, 0)

    return () => {
      clearTimeout(start)
      void connection.stop()
    }
  }, [roomId, finished, queryClient])
}

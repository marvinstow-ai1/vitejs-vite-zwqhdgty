import { supabase } from '../supabase.js'

/**
 * Lädt Benachrichtigungen für einen User (neueste zuerst).
 * Reichert sie mit Sender-Usernamen an.
 */
export async function loadNotifications(userId, limit = 30) {
  const { data: notifs } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!notifs?.length) return []

  const senderIds = [...new Set(notifs.map(n => n.from_user_id).filter(Boolean))]
  let usernameMap = {}
  if (senderIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', senderIds)
    profiles?.forEach(p => { usernameMap[p.id] = p.username })
  }

  return notifs.map(n => ({
    ...n,
    senderUsername: usernameMap[n.from_user_id] || null,
  }))
}

/**
 * Gibt die Anzahl ungelesener Benachrichtigungen zurück.
 */
export async function getUnreadCount(userId) {
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false)
  return count || 0
}

/**
 * Markiert alle Benachrichtigungen eines Users als gelesen.
 */
export async function markAllRead(userId) {
  return supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false)
}

/**
 * Abonniert Echtzeit-Benachrichtigungen für einen User.
 * Gibt den Channel zurück (zum späteren Entfernen).
 * @param {string} userId
 * @param {function} onNew — Callback bei neuer Notification
 */
export function subscribeToNotifications(userId, onNew) {
  const channel = supabase
    .channel(`notif-realtime-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      onNew
    )
    .subscribe()
  return channel
}

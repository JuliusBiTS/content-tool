/** Fake `npm:web-push` for testing the edge function. */
export const push = {
  sent: [] as { endpoint: string; payload: Record<string, string> }[],
  failWith: null as { statusCode: number } | null,
  reset() {
    this.sent = []
    this.failWith = null
  },
}

export default {
  setVapidDetails() {},
  async sendNotification(sub: { endpoint: string }, payload: string) {
    if (push.failWith) throw push.failWith
    push.sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
  },
}

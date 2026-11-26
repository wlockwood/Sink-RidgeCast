declare module 'h3' {
  interface H3EventContext {
    authMethod?: import('./auth').AuthMethod
    applicationLinkCredential?: import('../schemas/application-link-token').ApplicationLinkCredential
    userID?: string
    userEmail?: string
    cloudflare: {
      request: Request<unknown, IncomingRequestCfProperties>
      env: Cloudflare.Env
      context: ExecutionContext
    }
  }
}

export {}

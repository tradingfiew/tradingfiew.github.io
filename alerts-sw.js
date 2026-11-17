/* TradingFiew notification service worker.
 * Runs only in response to notifications requested by an OPEN page.
 * No PushManager subscription or backend exists, so it does not watch
 * markets and cannot trigger alerts after every app tab is closed.
 */
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const candidate=event.notification?.data?.url||"./";
  let destination;
  try{
    destination=new URL(candidate,self.registration.scope);
    if(destination.origin!==self.location.origin)destination=new URL("./",self.registration.scope);
  }catch{destination=new URL("./",self.registration.scope);}
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of clients){
      if(client.url.startsWith(self.registration.scope)){
        await client.focus();
        if(client.url!==destination.href&&"navigate" in client)await client.navigate(destination.href);
        return;
      }
    }
    await self.clients.openWindow(destination.href);
  })());
});
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
import CID from 'cids'
import isValidDomain from 'is-valid-domain'

const IPFSGatewayCheckerHash = 'bafybeifx7yeb55armcsxwwitkymga5xf53dxiarykms3ygqic223w5sk3m'
const SkynetGatewayCheckerHash = 'AAAKYhYQ1R6PwULeslCcsf5c3TGJdxboe9LUAjX5IPIB3w'
const IPFSGateway = 'https://cloudflare-ipfs.com'

const Gateways = {
  ipfs: [
    // `https://gateway.ipfs.io/ipfs/${ IPFSGatewayCheckerHash }`,
    `https://dweb.link/ipfs/${ IPFSGatewayCheckerHash }`,
    `https://ipfs.io/ipfs/${ IPFSGatewayCheckerHash }`,
    `https://ipfs-gateway.cloud/ipfs/${ IPFSGatewayCheckerHash }`,
    `https://gateway.pinata.cloud/ipfs/${ IPFSGatewayCheckerHash }`,
    `https://4everland.io/ipfs/${ IPFSGatewayCheckerHash }`,
  ],
  skynet: [
    `https://siasky.net/${SkynetGatewayCheckerHash}`,
    `https://skynetfree.net/${SkynetGatewayCheckerHash}`,
    `https://web3portal.com/${SkynetGatewayCheckerHash}`,
    `https://skynetpro.net/${SkynetGatewayCheckerHash}`,
  ],
  arweave: [
    'https://arweave.net/'
  ]
}

const CacheStore = {}

const CacheTimestamp = 15 * 60 * 1000

const DWeb = {
  ipfs: 'dweb.ipfs',
  ipns: 'dweb.ipns',
  arweave: 'dweb.arweave',
  resilio: 'dweb.resilio',
  skynet: 'dweb.skynet'
}

async function gatewayChecker (gateway) {
  try {
    const res = await fetch(gateway)
    if (res.ok) {
      return gateway
    }
    else {
      return null
    }
  }
  catch (err) {
    console.error(err)
    return null
  }
}

async function gatewaysChecker (gateways, dweb) {
  const currentTimestamp = new Date().getTime()
  const cacheKey = `${dweb}GatewayCache`
  const cache = CacheStore[cacheKey]
  if (cache && currentTimestamp < cache.updateDateTimestamp + CacheTimestamp) {
    return cache.value
  }
  else {
    try {
      const list = gateways.map((gateway) => {
        return gatewayChecker(gateway)
      })
      const res = await Promise.race(list)
      if (res) {
        CacheStore[cacheKey] = {
          value: res,
          updateDateTimestamp: new Date().getTime()
        }
        return res
      }
      else {
        return cache?.value || gateways[0]
      }
    }
    catch (err) {
      console.error(err)
      return cache?.value || gateways[0]
    }
  }
}

function ipfsCidHandle (value) {
  let matched =
    value.match(/^ipfs:\/\/(.*)/i) ||
    value.match(/\/(ipfs)\/(.*)/i)
  if (matched) {
    return matched[matched.length - 1]
  }
  else {
    return value
  }
}

function ipnsCidHandle (value) {
  let matched =
    value.match(/^ipns:\/\/(.*)/i) ||
    value.match(/\/(ipns)\/(.*)/i)
  if (matched) {
    return matched[matched.length - 1]
  }
  else {
    return value
  }
}

function isIpfsCid (value) {
  try {
    const cid = new CID(value)
    if ((cid.codec === 'dag-pb' && cid.multibaseName === 'base58btc' && cid.version === 0) || (cid.codec === 'dag-pb' && cid.multibaseName === 'base32' && cid.version === 1)) {
      return true
    }
    else {
      return false
    }
  }
  catch (err) {
    return false
  }
}

function isIpnsCid (value) {
  try {
    const cid = new CID(value)
    if ((cid.codec === 'libp2p-key' && cid.multibaseName === 'base36' && cid.version === 1) || (cid.codec === 'libp2p-key' && cid.multibaseName === 'base32' && cid.version === 1)) {
      return true
    }
    else {
      return false
    }
  }
  catch (err) {
    return false
  }
}

/**
 * Determine if the domain host is correct
 * @param host
 */
export function isDomainHost (host) {
  try {
    return isValidDomain(host, { subdomain: true, wildcard: false, allowUnicode: true, topLevel: false })
  }
  catch (err) {
    return false
  }
}

async function handleRequest (event) {
  try {
    const request = event.request
    const url = new URL(request.url)
    const cacheKey = new Request(url.toString(), request)
    const cache = caches.default
    const response = await cache.match(cacheKey)
    if (response) {
      return response
    }
    else {
      let account = ''
      if (url.host === 'bit.cc') {
        return fetch(request)
      }
      else {
        account = url.host.replace('.cc', '')
      }
      const ipnsArr = []
      const ipfsArr = []
      const resilioArr = []
      const skynetArr = []
      const arweaveArr = []

      const currentTimestamp = new Date().getTime()
      const dWebCacheKey = account
      const dWebCache = CacheStore[dWebCacheKey]

      if (dWebCache && currentTimestamp < dWebCache.updateDateTimestamp + CacheTimestamp) {
        const _dweb = dWebCache.value.split('@')[0]
        const _value = dWebCache.value.split('@')[1]
        switch (_dweb) {
          case DWeb.ipns:
            ipnsArr.push(_value)
            break
          case DWeb.ipfs:
            ipfsArr.push(_value)
            break
          case DWeb.resilio:
            resilioArr.push(_value)
            break
          case DWeb.skynet:
            skynetArr.push(_value)
            break
          case DWeb.arweave:
            arweaveArr.push(_value)
            break
        }
      }
      else {
        const res = await fetch('https://indexer-v1.did.id/v2/account/records', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body: JSON.stringify({ account })
        })
        if (res.ok) {
          const { data } = await res.json()
          if (!data) {
            return fetch(request)
          }
          const records = data?.records
          records.forEach((record) => {
            switch (record.key) {
              case DWeb.ipns:
                ipnsArr.push(record.value)
                break
              case DWeb.ipfs:
                ipfsArr.push(record.value)
                break
              case DWeb.resilio:
                resilioArr.push(record.value)
                break
              case DWeb.skynet:
                skynetArr.push(record.value)
                break
              case DWeb.arweave:
                arweaveArr.push(record.value)
                break
            }
          })

          if (ipnsArr[0]) {
            CacheStore[dWebCacheKey] = {
              value: `${DWeb.ipns}@${ipnsArr[0]}`,
              updateDateTimestamp: new Date().getTime()
            }
          }
          else if (ipfsArr[0]) {
            CacheStore[dWebCacheKey] = {
              value: `${DWeb.ipfs}@${ipfsArr[0]}`,
              updateDateTimestamp: new Date().getTime()
            }
          }
          else if (skynetArr[0]) {
            CacheStore[dWebCacheKey] = {
              value: `${DWeb.skynet}@${skynetArr[0]}`,
              updateDateTimestamp: new Date().getTime()
            }
          }
          else if (arweaveArr[0]) {
            CacheStore[dWebCacheKey] = {
              value: `${DWeb.arweave}@${arweaveArr[0]}`,
              updateDateTimestamp: new Date().getTime()
            }
          }
        }
        else {
          return res
        }
      }

      let resUrl = ''
      if (ipnsArr[0]) {
        let cid
        if (isDomainHost(ipnsArr[0])) {
          cid = ipnsArr[0]
        }
        else {
          cid = ipnsCidHandle(ipnsArr[0])
          if (!isIpnsCid(cid)) {
            return fetch(request)
          }
        }
        resUrl = `${IPFSGateway}/ipns/${cid}${url.pathname}${url.search}`
      }
      else if (ipfsArr[0]) {
        let cid = ipfsCidHandle(ipfsArr[0])
        if (!isIpfsCid(cid)) {
          return fetch(request)
        }
        resUrl = `${IPFSGateway}/ipfs/${cid}${url.pathname}${url.search}`
      }
        // else if (resilioArr[0]) {
        //   resUrl = resilioArr[0]
      // }
      else if (skynetArr[0]) {
        let gateway = await gatewaysChecker(Gateways.skynet, DWeb.skynet)
        gateway = gateway.replace(SkynetGatewayCheckerHash, skynetArr[0])
        resUrl = `${gateway}${url.pathname}${url.search}`
      }
      else if (arweaveArr[0]) {
        resUrl = `${Gateways.arweave[0]}${arweaveArr[0]}${url.pathname}${url.search}`
      }

      if (resUrl) {
        console.log(resUrl)
        let newRes = await fetch(resUrl, {
          cf: {
            cacheTtl: 15 * 60,
            cacheEverything: true,
            cacheKey: resUrl
          }
        })
        if (newRes.ok) {
          newRes = new Response(newRes.body, newRes)
          newRes.headers.set('Cache-Control', 'max-age=900, s-maxage=900')
          event.waitUntil(cache.put(cacheKey, newRes.clone()))
          return newRes
        }
        else {
          return newRes
        }
      }
      else {
        return fetch(request)
      }
    }
  }
  catch (err) {
    console.error(err)
    return new Response(err)
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

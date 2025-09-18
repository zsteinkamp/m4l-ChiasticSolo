autowatch = 1
var MAX_TRACKS = 32
inlets = 1
outlets = 4

var debugLog = false

setinletassist(0, '<Bang> to initialize, <Float> to fade.')
OUTLET_STATUS = 0
OUTLET_SOLO = 1
OUTLET_NUM = 2
OUTLET_VAL = 3
setoutletassist(OUTLET_STATUS, '<String> Status message to display.')
setoutletassist(OUTLET_SOLO, '<chain idx, val> Solo state for given chain.')
setoutletassist(OUTLET_NUM, '<num_chains> number of chains mapped.')
setoutletassist(OUTLET_VAL, '<val> Active chain number.')

function debug() {
  if (debugLog) {
    post(
      debug.caller ? debug.caller.name : 'ROOT',
      Array.prototype.slice.call(arguments).join(' '),
      '\n'
    )
  }
}

debug('reloaded')

var state = {
  val: 0,
  enabled: 1,
  mute: 0,
  numChains: 0,
  chains: [],
}

function bang() {
  //debug('INIT')
  sendStatus('Initializing...')
  initialize()
}

function enabled(val) {
  state.enabled = val
  updateSolos()
}

function fader(val) {
  if (state.numChains === 0) {
    return
  }
  //debug('FADER: ' + val)
  if (val == 1) {
    state.val = state.numChains - 1
  } else {
    state.val = Math.floor(state.numChains * val)
  }
  outlet(OUTLET_VAL, state.val + 1)
  updateSolos()
}

function mute(val) {
  if (state.mute && !val) {
    // going from mute to solo
    for (var i = 0; i < state.numChains; i++) {
      if (!state.chains[i]) {
        continue
      }
      state.chains[i].set('mute', 0)
    }
  } else if (!state.mute && val) {
    // going from solo to mute
    for (var i = 0; i < state.numChains; i++) {
      if (!state.chains[i]) {
        continue
      }
      state.chains[i].set('solo', 0)
    }
  }
  state.mute = val
  updateSolos()
}

function updateSolos() {
  for (var i = 0; i < state.numChains; i++) {
    if (!state.chains[i]) {
      continue
    }
    if (state.enabled && i === state.val) {
      if (state.mute) {
        state.chains[i].set('mute', 0)
      } else {
        state.chains[i].set('solo', 1)
      }
      outlet(OUTLET_SOLO, [i + 1, 1])
    } else {
      if (state.mute) {
        state.chains[i].set('mute', 1)
      } else {
        state.chains[i].set('solo', 0)
      }
      outlet(OUTLET_SOLO, [i + 1, 0])
    }
  }
}

function sendStatus(str) {
  outlet(OUTLET_STATUS, str)
}

function getRackChainPaths(thisDevice, trackPaths) {
  var thisDevicePathTokens = thisDevice.unquotedpath.split(' ')
  var tokenLen = thisDevicePathTokens.length
  var thisDeviceNum = parseInt(thisDevicePathTokens[tokenLen - 1])

  if (isNaN(thisDeviceNum)) {
    sendStatus('ERROR: NaN device num :(')
    return
  }
  if (thisDeviceNum === 0) {
    sendStatus('ERROR: cannot be first device')
    return
  }

  //debug('DEVICENUM = ' + thisDeviceNum)

  var prevDevicePath =
    thisDevicePathTokens.slice(0, tokenLen - 1).join(' ') +
    ' ' +
    (thisDeviceNum - 1)
  //debug('PREVDEVICEPATH=' + prevDevicePath)

  var prevDevice = new LiveAPI(prevDevicePath)
  if (!prevDevice.get('can_have_chains')) {
    sendStatus('ERROR: no chains allowed in prev device')
    return
  }

  var liveApi = new LiveAPI()
  var currChain
  for (currChain = 0; currChain < MAX_TRACKS; currChain++) {
    var currChainPath = prevDevicePath + ' chains ' + currChain
    //debug('CURR_CHAIN_PATH=' + currChainPath)

    liveApi.path = currChainPath
    if (!liveApi.path) {
      //debug('last one okay!')
      return
    }
    trackPaths.push(currChainPath)
  }
}

function getGroupTrackPaths(thisDevice, trackPaths) {
  var pathArr = thisDevice.path.split(' ')
  while (pathArr.length > 2 && !pathArr.join(' ').match(/tracks \d+$/)) {
    pathArr.pop()
    debug('INTER: ' + pathArr.join(' '))
  }

  var path = pathArr.join(' ')
  debug('PATH ' + path)

  if (pathArr.length === 2) {
    debug('OOppsssiiieee')
    return
  }

  var thisTrack = new LiveAPI(path)
  if (thisTrack.get('is_foldable')) {
    // THIS IS A GROUP TRACK
    //debug('GROUP TRACK')
    var api = new LiveAPI(this.patcher, 'live_set')
    var trackCount = api.getcount('tracks')
    //debug('THIS TRACK', thisTrack.id)

    for (var index = 0; index < trackCount; index++) {
      api.path = 'live_set tracks ' + index
      //debug(api.path)
      if (parseInt(api.get('group_track')[1]) === parseInt(thisTrack.id)) {
        trackPaths.push(api.unquotedpath)
        //debug('FOUND CHILD', api.id, api.unquotedpath)
      }
    }
  }
}

function initialize() {
  debug('INITIALIZE')
  var thisDevice = new LiveAPI('live_set this_device')

  // populate trackPaths either from a rack device (instrument or effect)
  // or as the parent of a track group
  var trackPaths = []
  getRackChainPaths(thisDevice, trackPaths)
  if (trackPaths.length === 0) {
    getGroupTrackPaths(thisDevice, trackPaths)
  }

  // properly let go of devices for existing live.remote~ objects
  for (var i = 0; i < MAX_TRACKS; i++) {
    state.chains[i] = null
    //debug('REMOVED ' + (i + 1))
  }

  var currChain
  for (currChain = 0; currChain < trackPaths.length; currChain++) {
    var currChainPath = trackPaths[currChain]
    state.chains[currChain] = new LiveAPI(currChainPath)
    if (!state.chains[currChain].path) {
      debug('last one okay!')
      break
    }
    var trackId = parseInt(state.chains[currChain].id)
    debug('TRACK_ID: ' + trackId)
  }

  if (currChain > 0) {
    sendStatus('OK - Set up ' + currChain + ' chains.')
  } else {
    sendStatus('ERROR: Cannot handle it.')
  }
  state.numChains = currChain
  outlet(OUTLET_NUM, state.numChains)
  updateSolos()
}

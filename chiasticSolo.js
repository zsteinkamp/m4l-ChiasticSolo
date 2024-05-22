autowatch = 1
var MAX_TRACKS = 32
inlets = 1
outlets = 3

var debugLog = false

setinletassist(0, '<Bang> to initialize, <Float> to fade.')
OUTLET_STATUS = 0
OUTLET_VAL = 1
OUTLET_NUM = 2
setoutletassist(OUTLET_STATUS, '<String> Status message to display.')
setoutletassist(OUTLET_VAL, '<chain idx, val> Volume value for given chain.')
setoutletassist(OUTLET_NUM, '<num_chains> number of chains mapped.')

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
  if (val > 0) {
    val -= 1
  }
  debug('FADER: ' + val)
  state.val = val
  updateSolos()
}

function updateSolos() {
  for (var i = 0; i < state.numChains; i++) {
    if (!state.chains[i]) {
      continue
    }
    if (state.enabled && i === state.val) {
      state.chains[i].set('solo', 1)
      outlet(OUTLET_VAL, [i + 1, 1])
    } else {
      state.chains[i].set('solo', 0)
      outlet(OUTLET_VAL, [i + 1, 0])
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
  var thisTrack = new LiveAPI(thisDevice.get('canonical_parent'))
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

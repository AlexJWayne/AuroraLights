import {
  AccessoryConfig,
  API,
  CharacteristicValue,
  HAP,
  Logger,
  Service,
} from 'homebridge'
import Particle from 'particle-api-js'

const particle = new Particle()

let hap: HAP

export = (api: API) => {
  hap = api.hap
  api.registerAccessory('AuroraLights', AuroraLights)
}

interface AuroraConfig extends AccessoryConfig {
  particleAccessToken: string
  deviceId: string
}

interface ParticleVarResponse<T> {
  body: {
    cmd: 'VarReturn'
    name: string
    result: T
    coreInfo: {
      last_heard: string
      connected: true
      last_handshake_at: string
      deviceID: string
      product_id: number
    }
  }
  statusCode: number
}

class AuroraLights {
  name = 'AuroraLights'

  readonly log: Logger
  readonly config: AuroraConfig
  readonly api: API

  informationService: Service

  patternServices: Map<number, Service> = new Map()

  constructor(log: Logger, config: AccessoryConfig, api: API) {
    this.log = log
    this.config = config as AuroraConfig
    this.api = api

    this.log.info('AuroraLights Accessory Plugin Loaded')

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Alex Wayne')
      .setCharacteristic(hap.Characteristic.Model, 'v1')

    this.patternServices = new Map([
      [0, this.createPatternService('Fairy', 0)],
      [1, this.createPatternService('Duo', 1)],
      [2, this.createPatternService('Rainbow', 2)],
    ])
  }

  private createPatternService(name: string, mode: number): Service {
    const service = new hap.Service.Lightbulb(`${this.name}: ${name}`, name)
    service
      .getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.getPowerStatus(mode))
      .onSet((value) => this.setPowerStatus(mode, value))

    service
      .getCharacteristic(hap.Characteristic.Brightness)
      .onGet(() => this.getBrightness())
      .onSet((value) => this.setBrightness(value))

    service
      .getCharacteristic(hap.Characteristic.Hue)
      .onGet(() => this.getHue())
      .onSet((value) => this.setHue(value))

    service
      .getCharacteristic(hap.Characteristic.Saturation)
      .onGet(() => this.getSaturation())
      .onSet((value) => this.setSaturation(value))

    return service
  }

  getServices() {
    return [this.informationService, ...this.patternServices.values()]
    // if (this.patternServices.size > 0) {
    // }

    // const modeCount = await this.getVar<number>('modeCount')
    // for (let i = 0; i < modeCount; i++){
    //   const name = await this.getVar<string>(`modeName${i}`)
    //   this.patternServices.set(i, this.createPatternService(name, i))
    // }

    // return this.getServices()
  }

  private async callFn(name: string, argument = '') {
    await particle.callFunction({
      deviceId: this.config.deviceId,
      auth: this.config.particleAccessToken,
      name,
      argument,
    })
  }

  private async getVar<T>(name: string): Promise<T> {
    const response = (await particle.getVariable({
      deviceId: this.config.deviceId,
      auth: this.config.particleAccessToken,
      name,
    })) as ParticleVarResponse<T>

    return response.body.result
  }

  async getPowerStatus(forMode: number): Promise<boolean> {
    const currentMode = await this.getVar<number>('currentMode')
    if (forMode === currentMode) return this.getVar<boolean>('isOn')
    return false
  }

  async setPowerStatus(forMode: number, value: CharacteristicValue) {
    if (typeof value !== 'boolean') {
      return
    }

    // Turn off other unused services
    for (const [mode, service] of this.patternServices.entries()) {
      if (forMode !== mode) {
        service.updateCharacteristic(hap.Characteristic.On, false)
      }
    }

    // Switch to the right mode.
    this.callFn('changeMode', forMode.toString())
  }

  async getBrightness() {
    const brightnessAsByte = await this.getVar<number>('brightness')
    return Math.round((brightnessAsByte / 255) * 100)
  }

  setBrightness(value: CharacteristicValue) {
    if (typeof value !== 'number') return
    const brightnessAsByte = Math.round((value / 100) * 255)
    this.callFn('setBrightness', brightnessAsByte.toString())
  }

  async getSaturation() {
    const saturationAsByte = await this.getVar<number>('sat')
    return Math.round((saturationAsByte / 255) * 100)
  }

  setSaturation(value: CharacteristicValue) {
    if (typeof value !== 'number') return
    const saturationAsByte = Math.round((value / 100) * 255)
    this.callFn('setSat', saturationAsByte.toString())
  }

  async getHue() {
    const hueAsByte = await this.getVar<number>('hue')
    return Math.round((hueAsByte / 255) * 360)
  }

  setHue(value: CharacteristicValue) {
    if (typeof value !== 'number') return
    const HueAsByte = Math.round((value / 100) * 255)
    this.callFn('setHue', HueAsByte.toString())
  }
}

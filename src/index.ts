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
  name: string = 'AuroraLights'

  readonly log: Logger
  readonly config: AuroraConfig
  readonly api: API

  informationService: Service

  patternServices: Map<number, Service>

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

    return service
  }

  getServices() {
    return [
      this.informationService, //
      ...this.patternServices.values(),
    ]
  }

  private async callFn(name: string, argument: string = '') {
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
    const currentMode = await this.getVar<number>('mode')
    if (forMode === currentMode) return this.getVar<boolean>('isOn')
    return false
  }

  async setPowerStatus(forMode: number, value: CharacteristicValue) {
    if (typeof value !== 'boolean') return

    // Turn off other unused services
    for (const [mode, service] of this.patternServices.entries()) {
      if (forMode !== mode)
        service.updateCharacteristic(hap.Characteristic.On, false)
    }

    // Switch to the right mode.
    this.callFn('changeMode', forMode.toString())
  }

  async getBrightness() {
    const brightnessAsByte = await this.getVar<number>('bright')
    return Math.round((brightnessAsByte / 255) * 100)
  }

  setBrightness(value: CharacteristicValue) {
    if (typeof value !== 'number') return
    const brightnessAsByte = Math.round((value / 100) * 255)
    this.callFn('setBright', brightnessAsByte.toString())
  }
}

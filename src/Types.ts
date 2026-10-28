export interface SipSettings {
  login: string;
  sip_address: string;
  sip_name?: string;
  sip_password: string;
}

export interface Doorphone {
  id: number;
  address: string;
  apartment?: string | number | null;
  entrance?: string | number | null;
  snapshot?: string;
  door_open_url?: string;
  apartment_sip_settings?: SipSettings;
  courierWaiting?: boolean;
}

export interface DevicesResponse {
  doorphones: Doorphone[];
  barriers?: unknown[];
  gates?: unknown[];
}

export interface CameraResponse {
  channel: { stream_url: string; sub_stream_url?: string };
}

export interface InfoResponse {
  authorized: boolean;
  number: string;
}

export interface AuthResult {
  authorized: true;
}

export interface CodeResult {
  data: { status: string };
}

export interface ApiErrorBody {
  code: number;
  error: string;
  status: false;
}

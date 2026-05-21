export interface DockhandEnvironment {
  id: number | string;
  name: string;
  type?: string;
  status?: string;
}

export interface DockhandContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
}

export interface DockhandStack {
  name: string;
  id?: number | string;
  status?: string;
}

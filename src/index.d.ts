interface InputData {
  interval?: string;
  coin?: string;
}

interface InputParams {
  id: string;
  data: InputData;
}

interface ChainlinkResult {
  jobRunID: string;
  status?: string;
  error?: string;
  data?: any;
  result?: number;
}

type Callback = (statusCode: number, result: ChainlinkResult) => void;

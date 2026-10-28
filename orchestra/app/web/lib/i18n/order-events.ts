import { publish } from "../mq";

/** Use T10's shared connection and topology; local runs may omit RabbitMQ. */
export async function publishOrderEvent(
  exchange: string,
  payload: { type: string; no: string },
) {
  if (!process.env.AMQP_URL) return;
  await publish(exchange, payload);
}

type Order = {
  id: string;
  side: "buy" | "sell";
  price: number;
  size: number;
};

type OrderTableProps = {
  orders: Order[];
};

export function OrderTable({ orders }: OrderTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Side</th>
          <th>Price</th>
          <th>Size</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.id}>
            <td>{order.id}</td>
            <td>{order.side}</td>
            <td>{order.price}</td>
            <td>{order.size}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

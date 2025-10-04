import { render, screen } from "@testing-library/react";
import { MetricCard } from "../MetricCard";

describe('<MetricCard />', () => {
  it('exibe label e valor', () => {
    render(<MetricCard label="P&L diário" value="R$ 123,45" />);
    expect(screen.getByText('P&L diário')).toBeInTheDocument();
    expect(screen.getByText('R$ 123,45')).toBeInTheDocument();
  });
});

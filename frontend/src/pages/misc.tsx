import { Link } from "react-router";
import {
  Ticket,
  TicketHead,
  TicketPage,
  TicketSection,
} from "@/components/ticket.tsx";
import { Button } from "@/components/ui/button.tsx";

export function NotFoundPage() {
  return (
    <TicketPage width="sm">
      <Ticket>
        <TicketHead titleAs="h1" title="Page not found" tone="offline" />
        <TicketSection perforated={false} className="grid gap-5">
          <p>There's nothing at this address.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/" className="no-underline">
              Go to your cookers
            </Link>
          </Button>
        </TicketSection>
      </Ticket>
    </TicketPage>
  );
}

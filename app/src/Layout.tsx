import * as React from 'react';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';


export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <Container maxWidth={false} style = {{padding: 0}}>
      <Box>
        {children}
      </Box>
    </Container>
  );
}

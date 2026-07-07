import {
  Box,
  Container,
  Grid,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { createFileRoute } from '@tanstack/react-router';
import { PropsWithChildren } from 'react';
import { router } from '../App';
import { AppLink } from '../components/AppLink';
import {
  getNameFromPath,
  getTopLevelRoutes,
} from '../utils/string.utils';
import { ImageWrapper } from '../components/ImageWrapper';
import { cleanPath } from '../utils/queryParams.utils';
import nerscLogo from '../../images/NERSC_logo_no_spacing.svg';

export const Route = createFileRoute('/')({
  component: Index,
});

/**
 * Home page component that renders at the root route /
 */
function Index() {
  const topLevelRoutes = getTopLevelRoutes(router.flatRoutes).filter(
    (route) => route.fullPath !== '/playground/'
  );

  const PaperWithHover: React.FC<PropsWithChildren> = ({ children }) => (
    <Paper
      sx={{
        padding: 2,
        transition: '0.25s',
        '&:hover': {
          backgroundColor: 'grey.200',
        },
      }}
    >
      {children}
    </Paper>
  );

  return (
    <Box>
      <Box
        sx={{
          backgroundColor: 'grey.200',
          height: '250px',
        }}
      >
        <Container maxWidth="lg" sx={{ height: '100%' }}>
          <Stack
            alignItems="center"
            justifyContent="center"
            height="100%"
            spacing={2}
            textAlign="center"
          >
            <ImageWrapper height={60}>
              <img src={nerscLogo} alt="NERSC" />
            </ImageWrapper>
            <Typography
              variant="h6"
              component="h1"
              color="text.secondary"
              maxWidth={820}
            >
              Prototypes for monitoring and analysis view for power and
              performance metrics currently available from the Live Status and LDMS API
            </Typography>
          </Stack>
        </Container>
      </Box>
      <Container
        maxWidth="lg"
        sx={{
          marginTop: 3,
          marginBottom: 3,
        }}
      >
        <Stack spacing={3}>
          <Box>
            <Grid container spacing={1}>
              {topLevelRoutes.map((route) => (
                <Grid key={route.id} item xs={12} sm={6}>
                  <AppLink to={route.fullPath}>
                    <PaperWithHover>
                      <Stack>
                        <Typography
                          variant="h5"
                          component="h3"
                          fontWeight="bold"
                          color="primary.main"
                        >
                          {getNameFromPath(route.fullPath)}
                        </Typography>
                        <Box>
                          <Typography fontSize="small">
                            <code>{`/src/pages${route.id}index.tsx`}</code>
                          </Typography>
                        </Box>
                      </Stack>
                    </PaperWithHover>
                  </AppLink>
                </Grid>
              ))}
            </Grid>
            <Typography fontSize="small" color="text.secondary" sx={{ mt: 2 }}>
              <Link
                href={cleanPath(
                  `${import.meta.env.BASE_URL}/docs/user-job-performance-index-data-requirements.md`
                )}
                underline="hover"
                color="inherit"
                target="_blank"
                rel="noreferrer"
              >
                Job Performance Docs
              </Link>
              {' - Recent job performance UI data requirements'}
            </Typography>
          </Box>
          {/* <Box>
            {taskflowRoutes.length > 0 && (
              <Grid container spacing={1}>
                {taskflowRoutes.map((route) => (
                  <Grid key={route.id} item sm={6}>
                    <AppLink to={route.fullPath}>
                      <PaperWithHover>
                        <Stack>
                          <Typography
                            variant="h5"
                            component="h3"
                            fontWeight="bold"
                            color="primary.main"
                          >
                            {getNameFromPath(route.fullPath)}
                          </Typography>
                          <Box>
                            <Typography fontSize="small">
                              <code>{`/src/pages${route.id}index.tsx`}</code>
                            </Typography>
                          </Box>
                        </Stack>
                      </PaperWithHover>
                    </AppLink>
                  </Grid>
                ))}
              </Grid>
            )}
            {taskflowRoutes.length === 0 && (
              <Typography>No Task Flows configured in your app.</Typography>
            )}
          </Box> */}
        </Stack>
      </Container>
    </Box>
  );
}

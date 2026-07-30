import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import { AppBar, IconButton, Stack, Toolbar, Typography } from '@mui/material';
import { useLocation } from '@tanstack/react-router';
import React from 'react';
import nerscLogo from '../../images/NERSC_logo_no_spacing.svg';
import { AppLink } from './AppLink';
import { ImageWrapper } from './ImageWrapper';

const APP_NAMES_BY_PATH: Record<string, string> = {
  'center-performance': 'center performance',
  'user-job-performance': 'user job performance',
  'user-job-performance-alphaver': 'user job performance alphaver',
};

/**
 * Top navigation bar component
 */
export const TopBar: React.FC = () => {
  const { pathname } = useLocation();
  const appPath = pathname.replace(/^\/|\/$/g, '').split('/')[0];
  const appName = APP_NAMES_BY_PATH[appPath];

  return (
    <AppBar
      color="default"
      position="static"
      component="nav"
      sx={{
        backgroundColor: '#F2F3F3',
        borderBottom: '1px solid',
        borderBottomColor: '#C1C2C2',
        boxShadow: 'none',
      }}
    >
      <Toolbar>
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            flexGrow: 1,
          }}
        >
          <AppLink to="/">
            <ImageWrapper height={30}>
              <img src={nerscLogo} alt="NERSC" />
            </ImageWrapper>
          </AppLink>
          <AppLink to="/">
            <Typography variant="h6" component="div" fontWeight="bold">
              {appName ?? 'Performance Monitoring'}
            </Typography>
          </AppLink>
        </Stack>
        <IconButton size="large" edge="start" color="inherit">
          <AccountCircleIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
};

﻿using System;
using System.Drawing;
using System.Windows.Forms;
using WebSocketSharp.Server;

namespace SlackWindowsTray
{
    public partial class MainWindow : Form
    {
        private WebSocketServer _wssv = new WebSocketServer(4649);

        public MainWindow()
        {
            InitializeComponent();
        }

        private void MainWindow_Load(object sender, EventArgs e)
        {
            UpdateSlackState(SlackNotifierStates.DisconnectedFromExtension);
                
            _wssv.AddWebSocketService<SlackEndpoint>("/Slack");
            SlackEndpoint.OnSlackStateChanged += (o, state) => this.UIThread(delegate { UpdateSlackState(state); }); 

            _wssv.Start();
            if (_wssv.IsListening)
            {
                Console.WriteLine("Listening on port {0}, and providing WebSocket services:", _wssv.Port);
                foreach (var path in _wssv.WebSocketServices.Paths)
                {
                    Console.WriteLine("- {0}", path);
                }
            }
        }

        private void UpdateSlackState(SlackNotifierStates slackNotifierStates)
        {
            slackTrayIcon.Text = slackNotifierStates.ToString();
            slackTrayIcon.Icon = new Icon(@"Icons\" + slackNotifierStates.ToString() + ".ico");
            
        }

        private void MainWindow_FormClosed(object sender, FormClosedEventArgs e)
        {
            _wssv.Stop();
        }

        private void slackTrayIcon_Click(object sender, EventArgs e)
        {
            var activated = ChromeActivator.ActivateChromeWindowByTitle(window => window.Title.EndsWith(" Slack"));
            if (!activated)
            {
                MessageBox.Show("Couldn't find Slack window");
            }
        }
    }
}